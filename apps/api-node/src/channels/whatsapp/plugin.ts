// WhatsApp channel plugin — composition-based, no class hierarchy.
// Implements the ChannelPlugin<WhatsAppAccount> contract.

import type { ChannelPlugin, ChannelOutboundContext, OutboundDeliveryResult } from "../types.js";
import { sendTextMediaPayload } from "../outbound/send-payload.js";

// ---------------------------------------------------------------------------
// Account shape for this plugin
// ---------------------------------------------------------------------------

type WhatsAppAccount = {
  accountId: string;
  token?: string;
  allowFrom?: string[];
  groupAllowFrom?: string[];
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy?: "open" | "allowlist" | "disabled";
};

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export const whatsappPlugin: ChannelPlugin<WhatsAppAccount> = {
  id: "whatsapp",

  meta: {
    id: "whatsapp",
    label: "WhatsApp",
    selectionLabel: "WhatsApp (API)",
    docsPath: "/channels/whatsapp",
    blurb: "Connect via the WhatsApp Business API or Web protocol.",
    order: 1,
  },

  capabilities: {
    chatTypes: ["dm", "group"],
    media: true,
    reply: true,
  },

  config: {
    listAccountIds: (cfg) =>
      Object.keys(cfg.channels?.whatsapp?.accounts ?? {}),

    resolveAccount: (cfg, accountId) => {
      const accounts = cfg.channels?.whatsapp?.accounts ?? {};
      const id = accountId ?? Object.keys(accounts)[0] ?? "default";
      return { accountId: id, ...(accounts[id] ?? {}) } as WhatsAppAccount;
    },

    isConfigured: (account) => Boolean(account.token),

    resolveAllowFrom: ({ cfg, accountId }) => {
      const accounts = cfg.channels?.whatsapp?.accounts ?? {};
      const id = accountId ?? Object.keys(accounts)[0];
      return id ? accounts[id]?.allowFrom : undefined;
    },

    describeAccount: (account) => ({
      accountId: account.accountId,
      configured: Boolean(account.token),
      dmPolicy: account.dmPolicy ?? "pairing",
      allowFrom: account.allowFrom,
    }),
  },

  security: {
    resolveDmPolicy: ({ account }) =>
      account
        ? {
            policy: account.dmPolicy ?? "pairing",
            allowFrom: account.allowFrom,
            allowFromPath: `channels.whatsapp.accounts.${account.accountId}.`,
            approveHint: `Run: app channels whatsapp approve <sender-id>`,
          }
        : null,
  },

  outbound: {
    deliveryMode: "gateway",
    textChunkLimit: 4000,

    chunker: (text, limit) => {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit));
      }
      return chunks;
    },

    resolveTarget: ({ to, allowFrom }) => {
      const trimmed = (to ?? "").trim();
      if (!trimmed) {
        return { ok: false, error: new Error("No target specified") };
      }
      // WhatsApp group JID convention
      const isGroup = trimmed.endsWith("@g.us");
      const hasWildcard = (allowFrom ?? []).includes("*");
      if (isGroup || hasWildcard || !allowFrom?.length) {
        return { ok: true, to: trimmed };
      }
      if (allowFrom.includes(trimmed)) {
        return { ok: true, to: trimmed };
      }
      return {
        ok: false,
        error: new Error(`Target ${trimmed} not in allowFrom list`),
      };
    },

    sendText: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      // Lazily import gateway code so this module is cheap to import elsewhere
      const send = (ctx.deps as { sendWhatsApp?: typeof defaultSendWhatsApp } | undefined)
        ?.sendWhatsApp ?? defaultSendWhatsApp;
      const result = await send(ctx.to, ctx.text, { accountId: ctx.accountId });
      return { channel: "whatsapp", ...result };
    },

    sendMedia: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      const send = (ctx.deps as { sendWhatsApp?: typeof defaultSendWhatsApp } | undefined)
        ?.sendWhatsApp ?? defaultSendWhatsApp;
      const result = await send(ctx.to, ctx.text, {
        accountId: ctx.accountId,
        mediaUrl: ctx.mediaUrl,
      });
      return { channel: "whatsapp", ...result };
    },

    sendPayload: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> =>
      sendTextMediaPayload({ channel: "whatsapp", ctx, adapter: whatsappPlugin.outbound! }),
  },
};

// ---------------------------------------------------------------------------
// Default gateway send — replace with your WebSocket / API call
// ---------------------------------------------------------------------------

async function defaultSendWhatsApp(
  _to: string,
  _text: string,
  _opts: { accountId?: string | null; mediaUrl?: string },
): Promise<{ messageId: string }> {
  throw new Error("WhatsApp gateway not configured");
}
