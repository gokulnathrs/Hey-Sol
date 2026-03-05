// Core channel types — channel-agnostic contracts

/** Supported chat types across all channels */
export type ChatType = "direct" | "group" | "channel" | "thread";

/** Peer identifier: kind distinguishes user, group, channel, etc. */
export interface Peer {
  kind: "user" | "group" | "channel" | "thread";
  id: string;
}

/** Canonical inbound message — normalized from any channel */
export interface CanonicalInbound {
  channelId: string;
  accountId: string;
  chatType: ChatType;
  peerId: string;
  senderId: string;
  senderName: string;
  text: string;
  media: MediaAttachment[];
  replyTo?: ReplyMetadata;
  raw: unknown;
}

export interface MediaAttachment {
  type: "image" | "video" | "audio" | "document";
  url: string;
  mimeType?: string;
  fileName?: string;
}

export interface ReplyMetadata {
  messageId: string;
  senderId?: string;
  text?: string;
}

/** Route resolution result */
export interface ResolvedRoute {
  agentId: string;
  sessionKey: string;
  mainSessionKey: string;
  matchedBy: string;
}

/** Outbound message to send via a channel */
export interface OutboundMessage {
  channelId: string;
  target: string;
  text?: string;
  media?: MediaAttachment[];
  metadata?: Record<string, unknown>;
}

/** Result of sending an outbound message */
export interface OutboundResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** DM policy modes */
export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

/** Account configuration for a channel */
export interface ChannelAccountConfig {
  accountId: string;
  channelId: string;
  credentials: Record<string, string>;
  dmPolicy: DmPolicy;
  allowFrom?: string[];
}

/** Contract every channel adapter must implement */
export interface ChannelContract {
  readonly channelId: string;

  /** Initialize the adapter (connect to SDK, etc.) */
  initialize(config: ChannelAccountConfig): Promise<void>;

  /** Normalize a raw inbound event to the canonical schema */
  normalizeInbound(rawEvent: unknown, accountId: string): CanonicalInbound;

  /** Send an outbound message */
  sendOutbound(message: OutboundMessage): Promise<OutboundResult>;

  /** Validate and normalize a target identifier for this channel */
  normalizeTarget(raw: string): string;

  /** Check if a sender is allowed per DM policy */
  checkDmPolicy(senderId: string, config: ChannelAccountConfig): boolean;
}
