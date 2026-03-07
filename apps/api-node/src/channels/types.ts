// Core channel types — channel-agnostic contracts

// ---------------------------------------------------------------------------
// App-level config shape (used by ChannelPlugin adapters)
// ---------------------------------------------------------------------------

export type AppConfig = {
  channels?: {
    whatsapp?: {
      accounts?: Record<
        string,
        {
          token?: string;
          allowFrom?: string[];
          groupAllowFrom?: string[];
          dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
          groupPolicy?: "open" | "allowlist" | "disabled";
        }
      >;
    };
    telegram?: {
      accounts?: Record<string, unknown>;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Channel Plugin Contract types
// ---------------------------------------------------------------------------

export type ChannelId = string;

export type GroupPolicy = "open" | "allowlist" | "disabled";

export type ChannelMeta = {
  id: ChannelId;
  label: string;
  selectionLabel: string;
  docsPath: string;
  blurb: string;
  order?: number;
};

export type ChannelCapabilities = {
  chatTypes: Array<"dm" | "group" | "thread">;
  media?: boolean;
  polls?: boolean;
  reactions?: boolean;
  reply?: boolean;
  threads?: boolean;
};

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  connected?: boolean;
  dmPolicy?: string;
  allowFrom?: string[];
  lastConnectedAt?: number | null;
  lastError?: string | null;
};

export type ChannelSecurityDmPolicy = {
  policy: string;
  allowFrom?: Array<string | number> | null;
  allowFromPath: string;
  approveHint: string;
  normalizeEntry?: (raw: string) => string;
};

export type ChannelSecurityContext<ResolvedAccount = unknown> = {
  cfg: AppConfig;
  accountId?: string | null;
  account: ResolvedAccount;
};

export type OutboundDeliveryResult = {
  channel: ChannelId;
  messageId: string;
  [key: string]: unknown;
};

export type ChannelOutboundContext = {
  cfg: AppConfig;
  to: string;
  text: string;
  mediaUrl?: string;
  accountId?: string | null;
  deps?: Record<string, unknown>;
};

export type ChannelConfigAdapter<ResolvedAccount> = {
  listAccountIds: (cfg: AppConfig) => string[];
  resolveAccount: (cfg: AppConfig, accountId?: string | null) => ResolvedAccount;
  isEnabled?: (account: ResolvedAccount, cfg: AppConfig) => boolean;
  isConfigured?: (account: ResolvedAccount, cfg: AppConfig) => boolean | Promise<boolean>;
  describeAccount?: (account: ResolvedAccount, cfg: AppConfig) => ChannelAccountSnapshot;
  resolveAllowFrom?: (params: { cfg: AppConfig; accountId?: string | null }) => Array<string | number> | undefined;
  resolveDefaultTo?: (params: { cfg: AppConfig; accountId?: string | null }) => string | undefined;
};

export type ChannelOutboundAdapter = {
  deliveryMode: "direct" | "gateway" | "hybrid";
  chunker?: ((text: string, limit: number) => string[]) | null;
  textChunkLimit?: number;
  resolveTarget?: (params: {
    to?: string;
    allowFrom?: string[];
    accountId?: string | null;
    mode?: "explicit" | "implicit";
  }) => { ok: true; to: string } | { ok: false; error: Error };
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendPayload?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
};

export type ChannelSecurityAdapter<ResolvedAccount = unknown> = {
  resolveDmPolicy?: (ctx: ChannelSecurityContext<ResolvedAccount>) => ChannelSecurityDmPolicy | null;
  collectWarnings?: (ctx: ChannelSecurityContext<ResolvedAccount>) => string[] | Promise<string[]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChannelPlugin<ResolvedAccount = any> = {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: ChannelConfigAdapter<ResolvedAccount>;
  outbound?: ChannelOutboundAdapter;
  security?: ChannelSecurityAdapter<ResolvedAccount>;
};

// ---------------------------------------------------------------------------
// Legacy adapter types (kept for backward compatibility)
// ---------------------------------------------------------------------------

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
