// WhatsApp inbound normalization — converts raw WhatsApp events to canonical schema

import { CanonicalInbound, ChatType, MediaAttachment } from "../types";
import { isGroupJid, extractPhoneFromJid } from "./target";

/** Raw WhatsApp message structure (Baileys-compatible) */
export interface RawWhatsAppMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
      contextInfo?: {
        stanzaId?: string;
        participant?: string;
        quotedMessage?: { conversation?: string };
      };
    };
    imageMessage?: {
      url: string;
      mimetype: string;
      fileName?: string;
    };
    videoMessage?: {
      url: string;
      mimetype: string;
      fileName?: string;
    };
    documentMessage?: {
      url: string;
      mimetype: string;
      fileName: string;
    };
    audioMessage?: {
      url: string;
      mimetype: string;
    };
  };
  pushName?: string;
}

/** Normalize a raw WhatsApp message to the canonical inbound schema */
export function normalizeWhatsAppInbound(
  raw: RawWhatsAppMessage,
  accountId: string
): CanonicalInbound {
  const jid = raw.key.remoteJid;
  const isGroup = isGroupJid(jid);
  const chatType: ChatType = isGroup ? "group" : "direct";

  // Extract text
  const text =
    raw.message?.conversation ||
    raw.message?.extendedTextMessage?.text ||
    "";

  // Extract media
  const media: MediaAttachment[] = [];
  if (raw.message?.imageMessage) {
    media.push({
      type: "image",
      url: raw.message.imageMessage.url,
      mimeType: raw.message.imageMessage.mimetype,
      fileName: raw.message.imageMessage.fileName,
    });
  }
  if (raw.message?.videoMessage) {
    media.push({
      type: "video",
      url: raw.message.videoMessage.url,
      mimeType: raw.message.videoMessage.mimetype,
    });
  }
  if (raw.message?.documentMessage) {
    media.push({
      type: "document",
      url: raw.message.documentMessage.url,
      mimeType: raw.message.documentMessage.mimetype,
      fileName: raw.message.documentMessage.fileName,
    });
  }
  if (raw.message?.audioMessage) {
    media.push({
      type: "audio",
      url: raw.message.audioMessage.url,
      mimeType: raw.message.audioMessage.mimetype,
    });
  }

  // Extract reply metadata
  const contextInfo = raw.message?.extendedTextMessage?.contextInfo;
  const replyTo = contextInfo?.stanzaId
    ? {
        messageId: contextInfo.stanzaId,
        senderId: contextInfo.participant,
        text: contextInfo.quotedMessage?.conversation,
      }
    : undefined;

  // Determine sender
  const senderId = isGroup
    ? raw.key.participant || extractPhoneFromJid(jid)
    : extractPhoneFromJid(jid);

  return {
    channelId: "whatsapp",
    accountId,
    chatType,
    peerId: jid,
    senderId,
    senderName: raw.pushName || senderId,
    text,
    media,
    replyTo,
    raw,
  };
}
