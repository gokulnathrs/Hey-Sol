// Outbound dispatcher — delegates to channel adapters

import { OutboundMessage, OutboundResult } from "./types";
import { channelRegistry } from "./registry";
import { formatForChannel } from "./formatter";

/** Dispatch an outbound message to the appropriate channel adapter */
export async function dispatchOutbound(message: OutboundMessage): Promise<OutboundResult> {
  console.log(`[Outbound] Dispatching to ${message.channelId} -> ${message.target}`);

  try {
    const adapter = channelRegistry.get(message.channelId);

    // Normalize the target for the specific channel
    const normalizedTarget = adapter.normalizeTarget(message.target);

    // Apply per-channel text formatting before delivery
    const formattedText = message.text
      ? formatForChannel(message.text, message.channelId)
      : message.text;

    const normalizedMessage = { ...message, target: normalizedTarget, text: formattedText };

    const result = await adapter.sendOutbound(normalizedMessage);

    if (result.success) {
      console.log(`[Outbound] Sent successfully: messageId=${result.messageId}`);
    } else {
      console.error(`[Outbound] Send failed: ${result.error}`);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Outbound] Dispatch error: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
