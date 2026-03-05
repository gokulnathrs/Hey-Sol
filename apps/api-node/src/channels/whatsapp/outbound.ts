// WhatsApp outbound — send messages via the WhatsApp client SDK

import { OutboundMessage, OutboundResult } from "../types";

/** WhatsApp SDK client interface (injectable for testing) */
export interface WhatsAppClient {
  sendMessage(jid: string, content: { text?: string; image?: { url: string }; document?: { url: string } }): Promise<{ key: { id: string } }>;
}

let waClient: WhatsAppClient | null = null;

/** Set the WhatsApp SDK client */
export function setWhatsAppClient(client: WhatsAppClient): void {
  waClient = client;
  console.log("[WhatsApp] Client SDK set");
}

/** HTTP bridge client — delegates to the Baileys bridge service */
class HttpBridgeClient implements WhatsAppClient {
  constructor(private bridgeUrl: string) {}

  async sendMessage(
    jid: string,
    content: { text?: string; image?: { url: string }; document?: { url: string } }
  ): Promise<{ key: { id: string } }> {
    const res = await fetch(`${this.bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: jid, text: content.text || "" }),
    });
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error || `Bridge returned HTTP ${res.status}`);
    }
    const data = await res.json() as { messageId?: string };
    return { key: { id: data.messageId ?? "" } };
  }
}

/** Configure the HTTP bridge as the active WhatsApp client */
export function setBridgeUrl(url: string): void {
  waClient = new HttpBridgeClient(url);
  console.log(`[WhatsApp] Bridge client configured: ${url}`);
}

/** Send an outbound message via WhatsApp */
export async function sendWhatsAppMessage(message: OutboundMessage): Promise<OutboundResult> {
  if (!waClient) {
    return {
      success: false,
      error: "WhatsApp client not initialized",
    };
  }

  try {
    const content: Record<string, unknown> = {};

    if (message.text) {
      content.text = message.text;
    }

    if (message.media && message.media.length > 0) {
      const firstMedia = message.media[0];
      if (firstMedia.type === "image") {
        content.image = { url: firstMedia.url };
      } else if (firstMedia.type === "document") {
        content.document = { url: firstMedia.url };
      }
    }

    const result = await waClient.sendMessage(message.target, content as any);

    return {
      success: true,
      messageId: result.key.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WhatsApp] Send failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
