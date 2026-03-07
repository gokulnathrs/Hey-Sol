// Generic outbound helper — handles text chunking and multi-media sends.
// Shared by all channel plugins; no channel-specific logic lives here.

import type { ChannelOutboundContext, OutboundDeliveryResult } from "../types.js";

type SendableContext = ChannelOutboundContext & {
  mediaUrls?: string[];
};

type SendAdapter = {
  textChunkLimit?: number;
  chunker?: ((text: string, limit: number) => string[]) | null;
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
};

/**
 * Send a text+media payload through a channel plugin's outbound adapter.
 *
 * - Multiple media URLs are sent sequentially; only the first message carries
 *   the text body.
 * - For text-only payloads, the text is split into chunks when `chunker` and
 *   `textChunkLimit` are configured.
 */
export async function sendTextMediaPayload(params: {
  channel: string;
  ctx: SendableContext;
  adapter: SendAdapter;
}): Promise<OutboundDeliveryResult> {
  const text = params.ctx.text ?? "";
  const urls = params.ctx.mediaUrls?.length
    ? params.ctx.mediaUrls
    : params.ctx.mediaUrl
    ? [params.ctx.mediaUrl]
    : [];

  if (urls.length > 0) {
    if (!params.adapter.sendMedia) {
      throw new Error(
        `[${params.channel}] sendMedia is required when mediaUrl is provided`
      );
    }
    let last = await params.adapter.sendMedia({
      ...params.ctx,
      text,
      mediaUrl: urls[0],
    });
    for (let i = 1; i < urls.length; i++) {
      last = await params.adapter.sendMedia!({
        ...params.ctx,
        text: "",
        mediaUrl: urls[i],
      });
    }
    return last;
  }

  if (!params.adapter.sendText) {
    throw new Error(
      `[${params.channel}] sendText is required when no mediaUrl is provided`
    );
  }

  const limit = params.adapter.textChunkLimit;
  const chunks =
    limit && params.adapter.chunker
      ? params.adapter.chunker(text, limit)
      : [text];

  let last!: OutboundDeliveryResult;
  for (const chunk of chunks) {
    last = await params.adapter.sendText!({ ...params.ctx, text: chunk });
  }
  return last;
}