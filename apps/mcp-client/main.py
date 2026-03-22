from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from fastmcp import Client
from fastmcp.client.transports import NodeStdioTransport
from google import genai
import asyncpg
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
DATABASE_URL = os.getenv("DATABASE_URL")
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
    """Postgres-backed conversation store keyed by conversation_id."""

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @classmethod
    async def create(cls, database_url: str) -> "ConversationStore":
        pool = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=10)
        store = cls(pool)
        await store.init_schema()
        return store

    async def close(self):
        await self._pool.close()

    async def init_schema(self):
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_conversations (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL DEFAULT 'New Chat',
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                  id BIGSERIAL PRIMARY KEY,
                  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
                  role TEXT NOT NULL,
                  content TEXT NOT NULL,
                  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_timestamp
                  ON chat_messages (conversation_id, timestamp);

                CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at
                  ON chat_conversations (updated_at DESC);
                """
            )

    @staticmethod
    def _to_iso(value: datetime | str | None) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, str):
            return value
        return datetime.now(timezone.utc).isoformat()

    async def create_conversation(self, conversation_id: Optional[str] = None, title: str = "New Chat") -> Conversation:
        cid = conversation_id or str(uuid.uuid4())
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO chat_conversations (id, title)
                VALUES ($1, $2)
                ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
                RETURNING id, title, created_at, updated_at
                """,
                cid,
                title,
            )
            await self._prune_conversations(conn)

        return Conversation(
            id=row["id"],
            title=row["title"],
            messages=[],
            created_at=self._to_iso(row["created_at"]),
            updated_at=self._to_iso(row["updated_at"]),
        )

    async def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        async with self._pool.acquire() as conn:
            conv_row = await conn.fetchrow(
                "SELECT id, title, created_at, updated_at FROM chat_conversations WHERE id = $1",
                conversation_id,
            )
            if not conv_row:
                return None

            msg_rows = await conn.fetch(
                """
                SELECT role, content, timestamp
                FROM chat_messages
                WHERE conversation_id = $1
                ORDER BY timestamp ASC, id ASC
                LIMIT $2
                """,
                conversation_id,
                MAX_MESSAGES_PER_CONVERSATION,
            )

        return Conversation(
            id=conv_row["id"],
            title=conv_row["title"],
            messages=[
                ConversationMessage(
                    role=row["role"],
                    content=row["content"],
                    timestamp=self._to_iso(row["timestamp"]),
                )
                for row in msg_rows
            ],
            created_at=self._to_iso(conv_row["created_at"]),
            updated_at=self._to_iso(conv_row["updated_at"]),
        )

    async def get_or_create(self, conversation_id: Optional[str] = None) -> Conversation:
        if conversation_id:
            existing = await self.get_conversation(conversation_id)
            if existing:
                return Conversation(
                    id=existing.id,
                    title=existing.title,
                    messages=[],
                    created_at=existing.created_at,
                    updated_at=existing.updated_at,
                )
        return await self.create_conversation(conversation_id)

    async def add_message(self, conversation_id: str, role: str, content: str):
        title_candidate = content[:50] + ("..." if len(content) > 50 else "")

        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO chat_conversations (id, title)
                VALUES ($1, 'New Chat')
                ON CONFLICT (id) DO NOTHING
                """,
                conversation_id,
            )

            await conn.execute(
                """
                INSERT INTO chat_messages (conversation_id, role, content)
                VALUES ($1, $2, $3)
                """,
                conversation_id,
                role,
                content,
            )

            await conn.execute(
                """
                UPDATE chat_conversations
                SET
                  title = CASE
                    WHEN $2 = 'user' AND title = 'New Chat' THEN $3
                    ELSE title
                  END,
                  updated_at = now()
                WHERE id = $1
                """,
                conversation_id,
                role,
                title_candidate,
            )

            await conn.execute(
                """
                DELETE FROM chat_messages
                WHERE id IN (
                  SELECT id
                  FROM chat_messages
                  WHERE conversation_id = $1
                  ORDER BY timestamp DESC, id DESC
                  OFFSET $2
                )
                """,
                conversation_id,
                MAX_MESSAGES_PER_CONVERSATION,
            )

    async def get_history_contents(self, conversation_id: str) -> list:
        """Return last N messages as Gemini Content objects."""
        async with self._pool.acquire() as conn:
            recent = await conn.fetch(
                """
                SELECT role, content
                FROM chat_messages
                WHERE conversation_id = $1
                ORDER BY timestamp DESC, id DESC
                LIMIT $2
                """,
                conversation_id,
                MAX_HISTORY_MESSAGES,
            )

        recent = list(reversed(recent))
        contents = []
        for msg in recent:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(genai.types.Content(
                role=role,
                parts=[genai.types.Part.from_text(text=msg["content"])]
            ))
        return contents

    async def list_conversations(self) -> list[dict]:
        """Return all conversations (metadata only)."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                  c.id,
                  c.title,
                  c.created_at,
                  c.updated_at,
                  COUNT(m.id)::int AS message_count
                FROM chat_conversations c
                LEFT JOIN chat_messages m ON m.conversation_id = c.id
                GROUP BY c.id, c.title, c.created_at, c.updated_at
                ORDER BY c.updated_at DESC
                """
            )

        return [
            {
                "id": row["id"],
                "title": row["title"],
                "messageCount": row["message_count"],
                "created_at": self._to_iso(row["created_at"]),
                "updated_at": self._to_iso(row["updated_at"]),
            }
            for row in rows
        ]

    async def delete_conversation(self, conversation_id: str) -> bool:
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM chat_conversations WHERE id = $1",
                conversation_id,
            )
        deleted_count = int(result.split(" ")[-1])
        return deleted_count > 0

    async def _prune_conversations(self, conn: asyncpg.Connection):
        await conn.execute(
            """
            DELETE FROM chat_conversations
            WHERE id IN (
              SELECT id
              FROM chat_conversations
              ORDER BY updated_at DESC
              OFFSET $1
            )
            """,
            MAX_STORED_CONVERSATIONS,
        )


conversation_store: Optional[ConversationStore] = None


def get_conversation_store() -> ConversationStore:
    if conversation_store is None:
        raise RuntimeError("Conversation store is not initialized")
    return conversation_store


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
        result_meta: Optional[dict] = None,
    ):
        if not self.session:
            raise ValueError("MCP client session is not initialized")

        # Get or create conversation and store user message
        store = get_conversation_store()
        conv = await store.get_or_create(conversation_id)
        await store.add_message(conv.id, "user", query)

        # Build contents from conversation history
        contents = await store.get_history_contents(conv.id)

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
                    if result_meta is not None:
                        result_meta["transaction"] = tx_payload
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
        await store.add_message(conv.id, "assistant", full_response)


mcp_client_class = MCPClient()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global conversation_store

    if not DATABASE_URL:
        raise ValueError("DATABASE_URL not found. Add it to apps/mcp-client/.env")

    conversation_store = await ConversationStore.create(DATABASE_URL)

    print("Starting MCP Client...")
    await mcp_client_class.connect_to_server()
    yield

    if conversation_store:
        await conversation_store.close()

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
    return await get_conversation_store().list_conversations()


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    conv = await get_conversation_store().get_conversation(conversation_id)
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
    deleted = await get_conversation_store().delete_conversation(conversation_id)
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
    store = get_conversation_store()
    conv = await store.get_or_create(req.conversationId)

    full_response = ""
    result_meta: dict = {}
    try:
        async for chunk in mcp_client_class.stream_query(
            req.text, None, req.context, conv.id, result_meta
        ):
            full_response += chunk
    except Exception as e:
        print(f"[Channel Message] Error: {e}")
        return {"error": str(e), "conversationId": conv.id}

    latest_conv = await store.get_conversation(conv.id)

    return {
        "response": full_response,
        "transaction": result_meta.get("transaction"),
        "conversationId": conv.id,
        "conversationTitle": latest_conv.title if latest_conv else conv.title,
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
            conv = await get_conversation_store().get_or_create(conversation_id)

            try:
                async for chunk in mcp_client_class.stream_query(
                    user_message, websocket, context, conv.id
                ):
                    await websocket.send_json({"type": "stream", "text": chunk})
                latest_conv = await get_conversation_store().get_conversation(conv.id)
                await websocket.send_json({
                    "type": "done",
                    "conversationId": conv.id,
                    "conversationTitle": latest_conv.title if latest_conv else conv.title,
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
