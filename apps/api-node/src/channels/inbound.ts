// Inbound pipeline — receives canonical inbound, resolves route/session, dispatches to reply engine

import { CanonicalInbound, Peer } from "./types";
import { resolveRoute } from "./routing";
import { sessionStore } from "./session";
import { dispatchOutbound } from "./outbound";

/** Reply engine callback type */
export type ReplyEngine = (
  text: string,
  sessionKey: string,
  agentId: string,
) => Promise<string>;

let replyEngine: ReplyEngine | null = null;

/** Set the reply engine for processing messages */
export function setReplyEngine(engine: ReplyEngine): void {
  replyEngine = engine;
  console.log("[Inbound] Reply engine set");
}

/** Process an inbound message through the pipeline */
export async function processInbound(inbound: CanonicalInbound): Promise<void> {
  console.log(`[Inbound] Processing message from ${inbound.channelId}:${inbound.senderId}`);

  // 1. Resolve route
  const peer: Peer = {
    kind: inbound.chatType === "direct" ? "user" : inbound.chatType as Peer["kind"],
    id: inbound.peerId,
  };

  const route = resolveRoute(inbound.channelId, inbound.accountId, peer);
  console.log(`[Inbound] Route resolved: agent=${route.agentId}, session=${route.sessionKey}, matchedBy=${route.matchedBy}`);

  // 2. Get or create session
  const session = sessionStore.getOrCreate(route.sessionKey, route.agentId, inbound.channelId);

  // 3. Call reply engine
  if (!replyEngine) {
    console.error("[Inbound] No reply engine set, cannot process message");
    return;
  }

  try {
    const responseText = await replyEngine(inbound.text, session.sessionKey, route.agentId);

    // 4. Send response back through the channel
    await dispatchOutbound({
      channelId: inbound.channelId,
      target: inbound.peerId,
      text: responseText,
    });

    console.log(`[Inbound] Response sent to ${inbound.channelId}:${inbound.peerId}`);
  } catch (error) {
    console.error(`[Inbound] Error processing message:`, error);
    throw error;
  }
}
