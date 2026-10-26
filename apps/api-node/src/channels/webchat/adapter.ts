// Web Chat channel adapter — wraps the existing WebSocket chat into the channel system

import {
  ChannelContract,
  ChannelAccountConfig,
  CanonicalInbound,
  OutboundMessage,
  OutboundResult,
} from "../types";

/** Raw web chat message structure */
export interface RawWebChatMessage {
  message: string;
  context?: string;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
}

export class WebChatAdapter implements ChannelContract {
  readonly channelId: string = "webchat";
  private config: ChannelAccountConfig | null = null;

  async initialize(config: ChannelAccountConfig): Promise<void> {
    this.config = config;
    console.log(`[WebChat] Adapter initialized for account: ${config.accountId}`);
  }

  normalizeInbound(rawEvent: unknown, accountId: string): CanonicalInbound {
    const event = rawEvent as RawWebChatMessage;
    const senderId = event.senderId || event.context?.split("sender=")[1]?.split(" ")[0] || "anonymous";

    return {
      channelId: "webchat",
      accountId,
      chatType: "direct",
      peerId: event.conversationId || senderId,
      senderId,
      senderName: event.senderName || senderId,
      text: event.message,
      media: [],
      raw: rawEvent,
    };
  }

  async sendOutbound(message: OutboundMessage): Promise<OutboundResult> {
    // Web chat outbound is handled directly via WebSocket in the mcp-client
    // This adapter is primarily for normalization purposes
    console.log(`[WebChat] Outbound: ${message.target} -> ${message.text?.substring(0, 50)}...`);
    return {
      success: true,
      messageId: Date.now().toString(),
    };
  }

  normalizeTarget(raw: string): string {
    return raw; // Web chat targets don't need normalization
  }

  checkDmPolicy(_senderId: string, _config: ChannelAccountConfig): boolean {
    return true; // Web chat is always open
  }
}
