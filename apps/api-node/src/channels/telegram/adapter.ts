// Telegram channel adapter — implements ChannelContract
// Uses Telegram Bot API with HTTP long-polling for local dev (no public URL needed)

import {
  ChannelContract,
  ChannelAccountConfig,
  CanonicalInbound,
  OutboundMessage,
  OutboundResult,
  ChatType,
} from "../types";
import { normalizeTelegramTarget } from "./target";

const TG_API = "https://api.telegram.org";

export class TelegramAdapter implements ChannelContract {
  readonly channelId: string = "telegram";
  private config: ChannelAccountConfig | null = null;
  private botToken: string | null = null;
  private polling = false;
  private offset = 0;

  /** Called by inbound pipeline when a message arrives — set externally */
  onMessage: ((canonical: CanonicalInbound) => Promise<void>) | null = null;

  async initialize(config: ChannelAccountConfig): Promise<void> {
    this.config = config;
    this.botToken = config.credentials["botToken"] || null;

    if (!this.botToken) {
      console.warn("[Telegram] No botToken configured — channel inactive");
      return;
    }

    // Verify token and log bot info
    try {
      const me = await this.apiCall("getMe", {});
      console.log(`[Telegram] Connected as @${me.username} (id: ${me.id})`);
    } catch (err) {
      console.error("[Telegram] Token verification failed:", err);
      return;
    }

    // Delete any existing webhook (conflicts with long-polling)
    await this.apiCall("deleteWebhook", { drop_pending_updates: false }).catch(() => null);

    this.startPolling();
  }

  stopPolling(): void {
    this.polling = false;
  }

  private async apiCall(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.botToken) throw new Error("No bot token");
    const res = await fetch(`${TG_API}/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json() as { ok: boolean; result: any; description?: string };
    if (!data.ok) throw new Error(data.description ?? `Telegram API error on ${method}`);
    return data.result;
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    console.log("[Telegram] Long-polling started");
    this.pollLoop().catch((err) => {
      console.error("[Telegram] Poll loop crashed:", err);
      this.polling = false;
    });
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const updates: any[] = await this.apiCall("getUpdates", {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ["message", "channel_post"],
        });

        if (updates.length > 0) {
          console.log(`[Telegram] Received ${updates.length} update(s) (offset=${this.offset})`);
        }

        for (const update of updates) {
          this.offset = update.update_id + 1;

          const msg = update.message || update.channel_post;
          const from = msg?.from || msg?.chat;
          console.log(
            `[Telegram] Update #${update.update_id} — ` +
            `from: ${from?.first_name || ""} ${from?.last_name || ""}`.trim() +
            ` (@${from?.username || from?.id}) ` +
            `text: "${(msg?.text || msg?.caption || "<no text>").slice(0, 100)}"`
          );

          const canonical = this.normalizeInbound(update, this.config?.accountId ?? "default");

          if (!canonical.text) {
            console.log(`[Telegram] Skipping update #${update.update_id} — no text content (media/sticker?)`);
            continue;
          }

          if (!this.onMessage) {
            console.warn(`[Telegram] onMessage handler not set — message from ${canonical.senderId} dropped!`);
            continue;
          }

          console.log(`[Telegram] → Dispatching to inbound pipeline: "${canonical.text.slice(0, 80)}"`);
          await this.onMessage(canonical).catch((err) =>
            console.error("[Telegram] onMessage error:", err)
          );
        }
      } catch (err) {
        if (this.polling) {
          console.error("[Telegram] Poll error (retrying in 5s):", err);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
    console.log("[Telegram] Long-polling stopped");
  }

  normalizeInbound(rawUpdate: unknown, accountId: string): CanonicalInbound {
    const update = rawUpdate as Record<string, any>;
    const message = update.message || update.channel_post || {};
    const chat = message.chat || {};
    const from = message.from || {};

    const chatTypeMap: Record<string, ChatType> = {
      private: "direct",
      group: "group",
      supergroup: "group",
      channel: "channel",
    };

    const threadId = message.message_thread_id;
    const peerId = threadId ? `${chat.id}:${threadId}` : String(chat.id);

    return {
      channelId: this.channelId,
      accountId,
      chatType: chatTypeMap[chat.type as string] || "direct",
      peerId,
      senderId: String(from.id || chat.id || ""),
      senderName:
        [from.first_name, from.last_name].filter(Boolean).join(" ") ||
        String(from.id || ""),
      text: message.text || message.caption || "",
      media: [],
      replyTo: message.reply_to_message
        ? {
            messageId: String(message.reply_to_message.message_id),
            senderId: String(message.reply_to_message.from?.id || ""),
            text: message.reply_to_message.text,
          }
        : undefined,
      raw: rawUpdate,
    };
  }

  async sendOutbound(message: OutboundMessage): Promise<OutboundResult> {
    if (!this.botToken) {
      return { success: false, error: "No bot token configured" };
    }

    try {
      const chatId = message.target.replace(/^@/, "");
      const result = await this.apiCall("sendMessage", {
        chat_id: isNaN(Number(chatId)) ? `@${chatId}` : Number(chatId),
        text: message.text || "",
        parse_mode: "Markdown",
      });

      return { success: true, messageId: String(result.message_id) };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[Telegram] sendOutbound failed: ${error}`);
      return { success: false, error };
    }
  }

  normalizeTarget(raw: string): string {
    return normalizeTelegramTarget(raw);
  }

  checkDmPolicy(senderId: string, config: ChannelAccountConfig): boolean {
    switch (config.dmPolicy) {
      case "open":        return true;
      case "disabled":    return false;
      case "allowlist":   return (config.allowFrom || []).includes(senderId);
      default:            return false;
    }
  }
}

