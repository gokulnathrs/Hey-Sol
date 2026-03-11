"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import MessageInput from "./MessageInput";
import {
  AudioWaveform,
  PencilRuler,
  Replace,
  Rocket,
  ScanSearch,
  Send,
  Loader2,
  Bot,
  User,
  Menu,
} from "lucide-react";
import Capsules from "./ui/Capsules";
import HeySol from "./HeySol";
import { WEBSOCKET_URL, MCP_API_URL } from "@hey-sol/shared";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import NFTCard, { NFT } from "./NFTCard";
import MarkdownMessage from "./MarkdownMessage";
import Sidebar, { ConversationMeta } from "./Sidebar";
import ChannelManager from "./ChannelManager";

type Message = {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  signablePayload?: SignablePayload;
  context?: string;
  nfts?: NFT[];
  isStreaming?: boolean;
};

export interface SignablePayload {
  type: "transaction";
  action: string;
  txMessageBase64: string;
  metadata?: Record<string, any>;
}

const STORAGE_KEY = (id: string) => `hey-sol:conversation:${id}`;
const NEW_CONV_KEY = "hey-sol:conversation:new";

const serializeMessages = (msgs: Message[]) =>
  JSON.stringify(msgs.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })));

const deserializeMessages = (raw: string): Message[] =>
  JSON.parse(raw).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));

const Greeting = () => (
  <div className="flex flex-col justify-center items-center gap-8 mt-16 lg:mt-24 px-4">
    <HeySol />
    <p className="text-3xl lg:text-5xl font-darker-grotesque font-medium text-foreground/90 text-center">
      Welcome! Ready to explore?
    </p>
  </div>
);

type MessagesProps = {
  messages: Message[];
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  handleSignAndSend: (payload: SignablePayload) => void;
};

const Messages = ({ messages, chatContainerRef, messagesEndRef, handleScroll, handleSignAndSend }: MessagesProps) => (
  <div
    ref={chatContainerRef}
    onScroll={handleScroll}
    className="flex-1 overflow-y-auto py-4 pb-8 px-2 lg:px-4 scroll-smooth"
    style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(153,69,255,0.2) transparent" }}
  >
    <div className="flex flex-col gap-3 max-w-3xl mx-auto">
      {messages.map((m) => {
        if (m.sender === "bot" && m.text === "" && !m.isStreaming) return null;

        return (
          <div
            key={m.id}
            className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
              m.sender === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${
                m.sender === "user"
                  ? "bg-sol-purple/20 text-sol-purple"
                  : "bg-sol-green/20 text-sol-green"
              }`}
            >
              {m.sender === "user" ? (
                <User className="size-4" />
              ) : (
                <Bot className="size-4" />
              )}
            </div>

            {/* Message bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                m.sender === "user"
                  ? "bg-sol-purple/15 border border-sol-purple/20"
                  : "bg-foreground/5 border border-foreground/10"
              }`}
            >
              {m.sender === "bot" ? (
                <>
                  <MarkdownMessage content={m.text} isBot />
                  {m.isStreaming && m.text === "" && (
                    <div className="flex items-center gap-2 text-foreground/40">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  )}
                  {m.isStreaming && m.text !== "" && (
                    <span className="inline-block w-2 h-5 bg-sol-green/70 animate-pulse rounded-sm ml-0.5" />
                  )}
                </>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </p>
              )}

              {m.signablePayload && (
                <button
                  onClick={() => handleSignAndSend(m.signablePayload!)}
                  className="mt-3 px-4 py-2 bg-gradient-to-r from-sol-purple to-sol-purple/90 text-white rounded-xl
                             text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity"
                >
                  Sign & Confirm {m.signablePayload.action}
                </button>
              )}

              {m.nfts && m.nfts.length > 0 && (
                <div className="mt-4 flex gap-3 overflow-x-auto max-w-[700px] pb-2">
                  {m.nfts.map((nft, idx) => (
                    <NFTCard key={nft.mint + idx} nft={nft} />
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <p className="text-[10px] text-foreground/30 mt-2">
                {m.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  </div>
);

const ChatInterface = () => {
  const { sendTransaction, publicKey } = useWallet();
  const solanaRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [channelManagerOpen, setChannelManagerOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingBotMessageIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const fetchConversationsRef = useRef<() => void>(() => {});

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    const settled = messages.filter((m) => !m.isStreaming);
    if (settled.length === 0) return;
    const key = conversationId ? STORAGE_KEY(conversationId) : NEW_CONV_KEY;
    try {
      localStorage.setItem(key, serializeMessages(settled));
    } catch {}
  }, [messages, conversationId]);

  // On mount, restore any in-progress new conversation from localStorage
  useEffect(() => {
    if (conversationId) return;
    try {
      const stored = localStorage.getItem(NEW_CONV_KEY);
      if (stored) setMessages(deserializeMessages(stored));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    const ws = new WebSocket(`${WEBSOCKET_URL}/chat`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const resp = JSON.parse(event.data);
      const botMessageId = pendingBotMessageIdRef.current;
      if (!botMessageId) return;

      if (resp.type === "stream") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, text: m.text + resp.text }
              : m
          )
        );
      } else if (resp.type === "txn_signing") {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            text:
              resp.transaction.message ||
              `Prepared **${resp.transaction.action}** transaction for ${resp.transaction.metadata.amount} SOL → \`${resp.transaction.metadata.recipient}\``,
            sender: "bot",
            timestamp: new Date(),
            signablePayload: resp.transaction,
          },
        ]);
      } else if (resp.type === "nft_list") {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 3).toString(),
            text: `Found **${resp.nfts.length}** NFTs in your wallet.`,
            sender: "bot",
            timestamp: new Date(),
            nfts: resp.nfts,
          },
        ]);
      } else if (resp.type === "done") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId ? { ...m, isStreaming: false } : m
          )
        );

        if (resp.conversationId) {
          setConversationId(resp.conversationId);
          try {
            const newData = localStorage.getItem(NEW_CONV_KEY);
            if (newData) {
              localStorage.setItem(STORAGE_KEY(resp.conversationId), newData);
              localStorage.removeItem(NEW_CONV_KEY);
            }
          } catch {}
        }

        pendingBotMessageIdRef.current = null;
        setIsLoading(false);
        fetchConversationsRef.current();
      } else if (resp.type === "error") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? {
                  ...m,
                  text: "Sorry, something went wrong. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
        pendingBotMessageIdRef.current = null;
        setIsLoading(false);
      }
    };

    ws.onerror = () => {
      const botMessageId = pendingBotMessageIdRef.current;
      if (botMessageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? {
                  ...m,
                  text: "Error connecting to chat service. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
      }
      pendingBotMessageIdRef.current = null;
      setIsLoading(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const quickActions = [
    { label: "Send SOL", icon: <Rocket className="size-4" /> },
    { label: "List NFTs", icon: <AudioWaveform className="size-4" /> },
    { label: "Get Balance", icon: <Replace className="size-4" /> },
    { label: "View Transactions", icon: <ScanSearch className="size-4" /> },
  ];

  const handleSignAndSend = async (payload: SignablePayload) => {
    if (!payload.txMessageBase64) return;
    if (!publicKey) {
      alert("Please connect your wallet to sign the transaction.");
      return;
    }

    const txBytes = Buffer.from(payload.txMessageBase64, "base64");
    const transaction = VersionedTransaction.deserialize(txBytes);

    try {
      const connection = new Connection(
        solanaRpcUrl
      );

      const sig = await sendTransaction(transaction, connection);
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: `Transaction successful! [view](https://solscan.io/tx/${sig}?cluster=devnet)`,
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    } catch (err: unknown) {
      console.error("Transaction failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const isUserCancelled =
        msg.toLowerCase().includes("plugin closed") ||
        msg.toLowerCase().includes("user rejected") ||
        msg.toLowerCase().includes("cancelled") ||
        msg.toLowerCase().includes("dismissed");
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: isUserCancelled
            ? "Transaction cancelled — wallet popup was closed."
            : `Transaction failed: ${msg}`,
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleSendMessage = (overrideMessage?: string) => {
    const msg = overrideMessage ?? lastMessage;
    if (msg.trim() === "" || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: msg,
      sender: "user",
      timestamp: new Date(),
      context: publicKey ? `sender=${publicKey.toBase58()}` : "no-wallet",
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Add a placeholder streaming message for the bot
    const botMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: botMessageId,
        text: "",
        sender: "bot",
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      const ws = wsRef.current;
      if (!ws) {
        throw new Error("Chat socket is not connected");
      }

      pendingBotMessageIdRef.current = botMessageId;

      const payload = JSON.stringify({
        message: msg,
        context: publicKey
          ? `sender=${publicKey.toBase58()}`
          : "no-wallet",
        conversationId: conversationIdRef.current,
      });

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener("open", () => ws.send(payload), { once: true });
      } else {
        throw new Error("Chat socket is closed");
      }
    } catch (error) {
      console.error("Error on chat streaming...", error);
      pendingBotMessageIdRef.current = null;
      setIsLoading(false);
    }

    setLastMessage("");
  };

  // Track whether the user is scrolled near the bottom
  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 120;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll only when user is near bottom or during streaming
  useEffect(() => {
    const isStreaming = messages.some((m) => m.isStreaming);
    if (isNearBottomRef.current || isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Fetch conversation list on mount
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${MCP_API_URL}/conversations`);
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  }, []);

  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load a conversation's messages
  const loadConversation = async (id: string) => {
    // Prefer localStorage (has full rich data: nfts, signablePayload, etc.)
    try {
      const stored = localStorage.getItem(STORAGE_KEY(id));
      if (stored) {
        setMessages(deserializeMessages(stored));
        setConversationId(id);
        setSidebarOpen(false);
        return;
      }
    } catch {}

    // Fallback: reconstruct from server (text only)
    try {
      const res = await fetch(`${MCP_API_URL}/conversations/${id}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(
          data.messages.map((m: any, i: number) => ({
            id: `${id}-${i}`,
            text: m.content,
            sender: m.role === "user" ? "user" : "bot",
            timestamp: new Date(m.timestamp),
          }))
        );
      }
      setConversationId(id);
      setSidebarOpen(false);
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setLastMessage("");
    setSidebarOpen(false);
    try { localStorage.removeItem(NEW_CONV_KEY); } catch {}
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(`${MCP_API_URL}/conversations/${id}`, { method: "DELETE" });
      try { localStorage.removeItem(STORAGE_KEY(id)); } catch {}
      if (conversationId === id) {
        handleNewConversation();
      }
      fetchConversations();
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleSignAndSendStable = useCallback(handleSignAndSend, [publicKey, sendTransaction]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={loadConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenChannels={() => {
          setSidebarOpen(false);
          setChannelManagerOpen(true);
        }}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-foreground/5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/60 transition-colors"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-poppins font-medium text-foreground/70 truncate">
              {conversationId
                ? conversations.find((c) => c.id === conversationId)?.title ||
                  "Chat"
                : "New Chat"}
            </h1>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {messages.filter((m) => m.text || m.isStreaming).length === 0 ? (
            <Greeting />
          ) : (
            <Messages
              messages={messages}
              chatContainerRef={chatContainerRef}
              messagesEndRef={messagesEndRef}
              handleScroll={handleScroll}
              handleSignAndSend={handleSignAndSendStable}
            />
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 lg:p-4">
          <div className="max-w-3xl mx-auto">
            {/* Quick Actions — above input */}
            {messages.length === 0 && (
              <div className="mb-3 flex flex-wrap justify-center gap-2">
                {quickActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => handleSendMessage(action.label)}
                    disabled={isLoading}
                  >
                    <Capsules label={action.label} icon={action.icon} />
                  </button>
                ))}
              </div>
            )}

            <div className="bg-background/70 sol-gradient rounded-[20px] overflow-hidden">
              <div className="bg-background/40 p-[1px] overflow-hidden">
                <div className="bg-background rounded-[19px]">
                  <MessageInput
                    setValue={setLastMessage}
                    value={lastMessage}
                    onEnter={() => handleSendMessage()}
                    disabled={isLoading}
                  />
                  <div className="flex justify-end items-center gap-1.5 pt-2 pr-2.5 pb-2.5">
                    <button className="p-2 hover:bg-foreground/5 text-foreground/60 hover:text-sol-purple/70 rounded-lg transition-colors">
                      <PencilRuler className="size-5" />
                    </button>
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={isLoading || lastMessage.trim() === ""}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        isLoading || lastMessage.trim() === ""
                          ? "text-foreground/20 cursor-not-allowed"
                          : "hover:bg-foreground/5 text-foreground/60 hover:text-sol-green/70"
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <Send className="size-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Manager */}
      <ChannelManager
        isOpen={channelManagerOpen}
        onClose={() => setChannelManagerOpen(false)}
      />
    </div>
  );
};

export default ChatInterface;
