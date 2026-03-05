// WhatsApp channel adapter — implements ChannelContract

import {
  ChannelContract,
  ChannelAccountConfig,
  CanonicalInbound,
  OutboundMessage,
  OutboundResult,
} from "../types";
import { normalizeWhatsAppInbound, RawWhatsAppMessage } from "./inbound";
import { sendWhatsAppMessage, setWhatsAppClient, setBridgeUrl, WhatsAppClient } from "./outbound";
import { normalizePhoneNumber } from "./target";

export class WhatsAppAdapter implements ChannelContract {
  readonly channelId: string = "whatsapp";
  private config: ChannelAccountConfig | null = null;

  async initialize(config: ChannelAccountConfig): Promise<void> {
    this.config = config;
    const bridgeUrl = config.credentials["bridgeUrl"] || "http://localhost:3003";
    setBridgeUrl(bridgeUrl);
    console.log(`[WhatsApp] Adapter initialized — bridge: ${bridgeUrl}`);
  }

  /** Inject a WhatsApp client SDK (for DI/testing) */
  setClient(client: WhatsAppClient): void {
    setWhatsAppClient(client);
  }

  normalizeInbound(rawEvent: unknown, accountId: string): CanonicalInbound {
    return normalizeWhatsAppInbound(rawEvent as RawWhatsAppMessage, accountId);
  }

  async sendOutbound(message: OutboundMessage): Promise<OutboundResult> {
    return sendWhatsAppMessage(message);
  }

  normalizeTarget(raw: string): string {
    return normalizePhoneNumber(raw);
  }

  checkDmPolicy(senderId: string, config: ChannelAccountConfig): boolean {
    switch (config.dmPolicy) {
      case "open":
        return true;
      case "disabled":
        return false;
      case "allowlist":
        return (config.allowFrom || []).includes(senderId);
      case "pairing":
        // Pairing requires an explicit link step — stub for now
        return false;
      default:
        return false;
    }
  }
}
