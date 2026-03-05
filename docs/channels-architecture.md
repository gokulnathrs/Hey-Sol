# Channels Architecture

## Overview

The channel system provides a **channel-agnostic** messaging architecture where inbound and outbound flows are decoupled from specific platforms. Each platform (WhatsApp, Telegram, Web Chat, etc.) is implemented as a pluggable **adapter** that conforms to the `ChannelContract` interface.

## Core Contracts

### ChannelContract

Every channel adapter must implement this interface:

```typescript
interface ChannelContract {
  readonly channelId: string;
  initialize(config: ChannelAccountConfig): Promise<void>;
  normalizeInbound(rawEvent: unknown, accountId: string): CanonicalInbound;
  sendOutbound(message: OutboundMessage): Promise<OutboundResult>;
  normalizeTarget(raw: string): string;
  checkDmPolicy(senderId: string, config: ChannelAccountConfig): boolean;
}
```

### CanonicalInbound

All channel adapters normalize raw platform events to this shared schema:

```typescript
interface CanonicalInbound {
  channelId: string;
  accountId: string;
  chatType: "direct" | "group" | "channel" | "thread";
  peerId: string;
  senderId: string;
  senderName: string;
  text: string;
  media: MediaAttachment[];
  replyTo?: ReplyMetadata;
  raw: unknown;
}
```

## Routing & Session Rules

### Deterministic Routing

Routes are resolved deterministically from message metadata — the LLM never chooses the channel.

Inputs: `channelId`, `accountId`, `peer { kind, id }`

Output: `{ agentId, sessionKey, mainSessionKey, matchedBy }`

Routes are matched by priority (highest first), with fallback to a default route.

### Session Keys

Session key format: `{channelId}:{accountId}:{peerKind}:{peerId}`

- **Direct chats** map to a user-level main session: `{channelId}:{accountId}:main:{peerId}`
- **Group/thread chats** remain isolated by their full session key

## Message Flow

```
Inbound Event (WhatsApp/Telegram/Web)
  → Channel Adapter: normalizeInbound()
  → Routing: resolveRoute()
  → Session: getOrCreate()
  → Reply Engine: generate response
  → Outbound Dispatcher: dispatchOutbound()
  → Channel Adapter: sendOutbound()
  → Platform SDK: deliver message
```

## WhatsApp Flow

1. Raw Baileys message arrives
2. `WhatsAppAdapter.normalizeInbound()` extracts text, media, reply context, and determines chat type (direct vs. group via JID suffix)
3. Target normalization validates E.164 phone numbers and group JIDs
4. DM policy checked (`open`, `allowlist`, `pairing`, `disabled`)
5. Outbound sends via injected `WhatsAppClient` SDK

## Telegram Extension Notes

- Adapter stub is implemented with the same contract
- Target format supports `chatId` or `chatId:threadId` for topic-scoped sessions
- Full transport requires connecting to Telegram Bot API (not yet implemented)
- Session design already supports thread/topic isolation via peer kind

## Module Map

### Core
- `channels/types.ts` — All shared types and contracts
- `channels/registry.ts` — Adapter registration and lookup
- `channels/routing.ts` — Deterministic route resolution
- `channels/session.ts` — Session store
- `channels/inbound.ts` — Inbound pipeline
- `channels/outbound.ts` — Outbound dispatcher

### WhatsApp
- `channels/whatsapp/adapter.ts` — Full adapter implementation
- `channels/whatsapp/inbound.ts` — Message normalization
- `channels/whatsapp/outbound.ts` — Send via SDK
- `channels/whatsapp/account.ts` — Account config resolution
- `channels/whatsapp/target.ts` — E.164 & JID normalization

### Telegram
- `channels/telegram/adapter.ts` — Stub adapter
- `channels/telegram/target.ts` — Target parser

### Web Chat
- `channels/webchat/adapter.ts` — Web chat adapter (wraps existing WebSocket flow)
