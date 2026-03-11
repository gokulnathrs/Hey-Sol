from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from fastmcp import Client
from fastmcp.client.transports import NodeStdioTransport
from google import genai
import json
import os
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from typing import Optional
from pydantic import BaseModel, Field

load_dotenv()

# --- Conversation Memory Store ---

MAX_HISTORY_MESSAGES = 20  # Send last N messages to LLM
MAX_STORED_CONVERSATIONS = int(os.getenv("MAX_STORED_CONVERSATIONS", "500"))
MAX_MESSAGES_PER_CONVERSATION = int(os.getenv("MAX_MESSAGES_PER_CONVERSATION", "200"))
MCP_CLIENT_API_KEY = os.getenv("MCP_CLIENT_API_KEY")
RATE_LIMIT_WINDOW_MS = int(os.getenv("MCP_RATE_LIMIT_WINDOW_MS", "60000"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("MCP_RATE_LIMIT_MAX_REQUESTS", "120"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

rate_limit_store: dict[str, dict[str, int]] = {}


def is_authorized(api_key: Optional[str], authorization_header: Optional[str]) -> bool:
    if not MCP_CLIENT_API_KEY:
        return True
    if api_key == MCP_CLIENT_API_KEY:
        return True
    if authorization_header and authorization_header.startswith("Bearer "):
        return authorization_header[7:] == MCP_CLIENT_API_KEY
    return False


def check_rate_limit(identity: str) -> bool:
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    bucket = rate_limit_store.get(identity)
    if not bucket or now_ms > bucket["reset_at"]:
        rate_limit_store[identity] = {"count": 1, "reset_at": now_ms + RATE_LIMIT_WINDOW_MS}
        return True

    if bucket["count"] >= RATE_LIMIT_MAX_REQUESTS:
        return False

    bucket["count"] += 1
    return True


class ConversationMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    timestamp: str


class Conversation(BaseModel):
    id: str
    title: str
    messages: list[ConversationMessage] = Field(default_factory=list)
    created_at: str
    updated_at: str


class ConversationStore:
    """In-memory conversation store keyed by conversation_id."""

    def __init__(self):
        self._conversations: dict[str, Conversation] = {}

    def create_conversation(self, conversation_id: Optional[str] = None, title: str = "New Chat") -> Conversation:
        cid = conversation_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conv = Conversation(id=cid, title=title, messages=[], created_at=now, updated_at=now)
        self._conversations[cid] = conv
        self._prune_conversations()
        return conv

    def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        return self._conversations.get(conversation_id)

    def get_or_create(self, conversation_id: Optional[str] = None) -> Conversation:
        if conversation_id and conversation_id in self._conversations:
            return self._conversations[conversation_id]
        return self.create_conversation(conversation_id)

    def add_message(self, conversation_id: str, role: str, content: str):
        conv = self._conversations.get(conversation_id)
        if not conv:
            conv = self.create_conversation(conversation_id)
        now = datetime.now(timezone.utc).isoformat()
        conv.messages.append(ConversationMessage(role=role, content=content, timestamp=now))
        if len(conv.messages) > MAX_MESSAGES_PER_CONVERSATION:
            conv.messages = conv.messages[-MAX_MESSAGES_PER_CONVERSATION:]
        conv.updated_at = now
        # Auto-set title from first user message
        if role == "user" and conv.title == "New Chat":
            conv.title = content[:50] + ("..." if len(content) > 50 else "")

    def get_history_contents(self, conversation_id: str) -> list:
        """Return last N messages as Gemini Content objects."""
        conv = self._conversations.get(conversation_id)
        if not conv:
            return []
        recent = conv.messages[-MAX_HISTORY_MESSAGES:]
        contents = []
        for msg in recent:
            role = "user" if msg.role == "user" else "model"
            contents.append(genai.types.Content(
                role=role,
                parts=[genai.types.Part.from_text(text=msg.content)]
            ))
        return contents

    def list_conversations(self) -> list[dict]:
        """Return all conversations (metadata only)."""
        result = []
        for conv in self._conversations.values():
            result.append({
                "id": conv.id,
                "title": conv.title,
                "messageCount": len(conv.messages),
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
            })
        # Sort by updated_at descending
        result.sort(key=lambda x: x["updated_at"], reverse=True)
        return result

    def delete_conversation(self, conversation_id: str) -> bool:
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]
            return True
        return False

    def _prune_conversations(self):
        overflow = len(self._conversations) - MAX_STORED_CONVERSATIONS
        if overflow <= 0:
            return

        sorted_items = sorted(
            self._conversations.items(),
            key=lambda pair: pair[1].updated_at,
        )
        for conv_id, _ in sorted_items[:overflow]:
            self._conversations.pop(conv_id, None)


conversation_store = ConversationStore()


# --- MCP Client ---

class MCPClient:
    def __init__(self):
        self.session = None
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY not found. Add it to your .env file")
        self.genai_client = genai.Client(api_key=gemini_api_key)
        self.mcp_tools = None

    async def connect_to_server(self):
        """Connect to the MCP server and initialize the session."""
        node_server_script = "../mcp-server/dist/index.js"

        transport = NodeStdioTransport(
            script_path=node_server_script,
            node_cmd="node",
        )

        mcp_client = Client(transport)
        await mcp_client.__aenter__()  # Connects the client
        print(f"Client connected: {mcp_client.is_connected()}")

        if not mcp_client.is_connected():
            await mcp_client.connect()

        self.session = mcp_client.session
        if not self.session:
            raise ValueError("Failed to connect to MCP server")

        tools = await convert_tools_to_genai_format(mcp_client)
        self.mcp_tools = tools

    async def stream_query(
        self,
        query: str,
        websocket: Optional[WebSocket] = None,
        context: Optional[str] = None,
        conversation_id: Optional[str] = None,
    ):
        if not self.session:
            raise ValueError("MCP client session is not initialized")

        # Get or create conversation and store user message
        conv = conversation_store.get_or_create(conversation_id)
        conversation_store.add_message(conv.id, "user", query)

        # Build contents from conversation history
        contents = conversation_store.get_history_contents(conv.id)

        try:
            print(f"[Conv {conv.id}] Sending {len(contents)} messages to Gemini")
            stream = await self.genai_client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=contents,
                config=genai.types.GenerateContentConfig(
                    temperature=0.5,
                    tools=self.mcp_tools,
                    system_instruction=context if context else None,
                ),
            )
        except Exception as e:
            print(f"Error creating Gemini stream: {e}")
            raise

        tool_call_part = None
        tool_name = None
        tool_args = None
        full_response = ""

        async for chunk in stream:
            if chunk.candidates and chunk.candidates[0].content and getattr(chunk.candidates[0].content, "parts", None):
                for part in chunk.candidates[0].content.parts:
                    if part is None:
                        continue
                    if getattr(part, "function_call", None):
                        tool_call_part = part
                        tool_name = part.function_call.name
                        tool_args = part.function_call.args
                        if websocket:
                            await websocket.send_json({
                                "type": "function_call",
                                "name": tool_name,
                                "args": tool_args
                            })
                        print(f"[Function Call Detected Tool]: {tool_name}, Args: {tool_args}")
                        break
                    elif getattr(part, "text", None):
                        print(f"[Streaming Text] {part.text}")
                        full_response += part.text
                        yield part.text

        if tool_call_part and tool_name:
            print(f"[Calling MCP Tool] {tool_name} with args {tool_args}")
            try:
                result = await self.session.call_tool(tool_name, tool_args)

                # Parse transaction payload
                tx_payload = None
                nft_list = []
                for c in result.content:
                    try:
                        if c.type == "text":
                            parsed = json.loads(c.text)
                            print("Parsed content:", parsed)
                            if parsed.get("type") == "nft-list" and "nfts" in parsed:
                                nft_list = parsed["nfts"]
                                print("Found NFT list in text content: ", nft_list)
                            if parsed.get("type") == "transaction":
                                tx_payload = parsed
                        elif c.type == "resource" and c.resource.mimeType == "application/json":
                            parsed = json.loads(c.resource.text)
                            if parsed.get("type") == "nft-list" and "nfts" in parsed:
                                nft_list = parsed["nfts"]
                            if parsed.get("type") == "transaction":
                                tx_payload = parsed
                    except Exception as e:
                        print("Parsing content failed:", e)

                function_response = {"result": result.content}
                print(f"[Tool Result] {function_response}")

                # Send txn_signing event to UI
                if tx_payload and websocket:
                    print("Sending txn_signing event to UI:", tx_payload)
                    await websocket.send_json({
                        "type": "txn_signing",
                        "transaction": tx_payload
                    })
                    tool_msg = tx_payload.get("message", f"Prepared {tx_payload.get('action', '')} transaction")
                    full_response += tool_msg
                elif tx_payload and not websocket:
                    # Channel mode (WhatsApp / Telegram) — produce readable text
                    action = tx_payload.get("action", "transaction")
                    amount = tx_payload.get("amount", "")
                    token = tx_payload.get("token", "SOL")
                    recipient = tx_payload.get("recipient", "")
                    tool_msg = tx_payload.get(
                        "message",
                        f"Transaction prepared: {action} {amount} {token}" +
                        (f" to {recipient}" if recipient else "") +
                        ". Please open the Hey-Sol web app to review and sign this transaction."
                    )
                    full_response += tool_msg
                    yield tool_msg

                # Send NFT list to UI
                if nft_list and websocket:
                    print("Sending nft_list event to UI:", nft_list)
                    await websocket.send_json({
                        "type": "nft_list",
                        "nfts": nft_list
                    })
                    full_response += f"Found {len(nft_list)} NFTs in your wallet."
                elif nft_list and not websocket:
                    # Channel mode — summarise NFT list as readable text
                    names = [n.get("name") or n.get("symbol") or "Unknown" for n in nft_list[:10]]
                    summary = ", ".join(names)
                    suffix = f" (and {len(nft_list) - 10} more)" if len(nft_list) > 10 else ""
                    nft_msg = f"You own {len(nft_list)} NFT(s): {summary}{suffix}."
                    full_response += nft_msg
                    yield nft_msg

                if not nft_list and not tx_payload:
                    function_response_part = genai.types.Part.from_function_response(
                        name=tool_name,
                        response=function_response,
                    )

                    function_response_content = genai.types.Content(
                        role="tool",
                        parts=[function_response_part],
                    )

                    print("Resuming Gemini stream with tool output...")
                    follow_up_stream = await self.genai_client.aio.models.generate_content_stream(
                        model="gemini-2.5-flash",
                        contents=[
                            *contents,
                            tool_call_part,
                            function_response_content,
                        ],
                        config=genai.types.GenerateContentConfig(
                            temperature=0.5,
                            tools=self.mcp_tools,
                            system_instruction=context if context else None,
                        ),
                    )

                    async for follow_chunk in follow_up_stream:
                        if follow_chunk.candidates:
                            for part in follow_chunk.candidates[0].content.parts:
                                if part.text:
                                    print(f"[Follow-up Text] {part.text}")
                                    full_response += part.text
                                    yield part.text

            except Exception as e:
                function_response = {"error": str(e)}
                print(f"[Tool Error] {e}")
                error_msg = f"Sorry, I ran into an error: {str(e)}"
                full_response += error_msg
                yield error_msg

        # Guard: if we still have no response (e.g. tool returned data but
        # no text path was hit), emit a generic fallback so channels never
        # receive an empty reply.
        if not full_response:
            fallback = "I processed your request but couldn't format a response for this channel. Please try the Hey-Sol web app for full results."
            full_response = fallback
            yield fallback

        # Store assistant response in conversation
        conversation_store.add_message(conv.id, "assistant", full_response)


mcp_client_class = MCPClient()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting MCP Client...")
    await mcp_client_class.connect_to_server()
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_and_rate_limit(request: Request, call_next):
    if request.url.path == "/":
        return await call_next(request)

    if not is_authorized(request.headers.get("x-api-key"), request.headers.get("authorization")):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    identity = request.client.host if request.client else "unknown"
    if not check_rate_limit(identity):
        return JSONResponse(status_code=429, content={"detail": "Too many requests"})

    return await call_next(request)


def has_format_key(schema):
    if isinstance(schema, dict):
        if 'format' in schema:
            return True
        return any(has_format_key(value) for value in schema.values())
    elif isinstance(schema, list):
        return any(has_format_key(item) for item in schema)
    return False


def remove_format_key(schema):
    if isinstance(schema, dict):
        schema.pop('format', None)
        for value in schema.values():
            remove_format_key(value)
    elif isinstance(schema, list):
        for item in schema:
            remove_format_key(item)


async def convert_tools_to_genai_format(mcp_client):
    genai_tools = []
    async with mcp_client:
        tools = await mcp_client.list_tools()
        for tool in tools:
            if has_format_key(tool.inputSchema):
                remove_format_key(tool.inputSchema)

            function_declaration = genai.types.FunctionDeclaration(
                name=tool.name,
                description=tool.description,
                parameters_json_schema=tool.inputSchema,
            )
            gemini_tool = genai.types.Tool(function_declarations=[function_declaration])
            genai_tools.append(gemini_tool)
    return genai_tools


@app.get("/")
async def root():
    return {"message": "Welcome to the MCP Client API"}


# --- REST endpoints for conversation management ---

@app.get("/conversations")
async def list_conversations():
    return conversation_store.list_conversations()


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    conv = conversation_store.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "id": conv.id,
        "title": conv.title,
        "messages": [m.model_dump() for m in conv.messages],
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    deleted = conversation_store.delete_conversation(conversation_id)
    return {"deleted": deleted}


# --- Channel message endpoint (used by api-node channel system) ---

class ChannelMessageRequest(BaseModel):
    text: str
    senderId: str
    channelId: str
    sessionKey: str
    context: Optional[str] = None
    conversationId: Optional[str] = None


@app.post("/channel/message")
async def channel_message(req: ChannelMessageRequest):
    """Process a message from any channel (WhatsApp, Telegram, etc.) through the LLM."""
    conv = conversation_store.get_or_create(req.conversationId)
    conversation_store.add_message(conv.id, "user", req.text)

    full_response = ""
    try:
        async for chunk in mcp_client_class.stream_query(
            req.text, None, req.context, conv.id
        ):
            full_response += chunk
    except Exception as e:
        print(f"[Channel Message] Error: {e}")
        return {"error": str(e), "conversationId": conv.id}

    return {
        "response": full_response,
        "conversationId": conv.id,
        "conversationTitle": conv.title,
    }


@app.websocket("/chat")
async def websocket_endpoint(websocket: WebSocket):
    if not is_authorized(websocket.headers.get("x-api-key"), websocket.headers.get("authorization")):
        await websocket.close(code=1008, reason="Unauthorized")
        return

    identity = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(identity):
        await websocket.close(code=1008, reason="Rate limit exceeded")
        return

    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            user_message = data.get('message', '')
            context = data.get('context', '')
            conversation_id = data.get('conversationId', None)
            print(f"Received query: {user_message} (conv: {conversation_id})")

            # Ensure conversation exists & return its id
            conv = conversation_store.get_or_create(conversation_id)

            try:
                async for chunk in mcp_client_class.stream_query(
                    user_message, websocket, context, conv.id
                ):
                    await websocket.send_json({"type": "stream", "text": chunk})
                await websocket.send_json({
                    "type": "done",
                    "conversationId": conv.id,
                    "conversationTitle": conv.title,
                })
            except Exception as e:
                print(f"Error processing query: {e}")
                await websocket.send_json({"type": "error", "text": str(e)})

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1000, reason=str(e))


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("MCP_CLIENT_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_CLIENT_PORT", "8002"))
    uvicorn.run(app, host=host, port=port, log_level="info")
    print(f"Server started at http://{host}:{port}")
