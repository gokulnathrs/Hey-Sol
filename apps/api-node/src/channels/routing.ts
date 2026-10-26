// Deterministic routing — resolve route from channel/account/peer metadata

import { Peer, ResolvedRoute } from "./types";

/** Route configuration entry */
export interface RouteConfig {
  channelId: string;
  accountId?: string;
  peerKind?: string;
  peerId?: string;
  agentId: string;
  priority: number;
}

/** In-memory route table */
let routeTable: RouteConfig[] = [];

/** Load route configurations */
export function loadRoutes(routes: RouteConfig[]): void {
  routeTable = routes.sort((a, b) => b.priority - a.priority);
  console.log(`[Routing] Loaded ${routeTable.length} route(s)`);
}

/** Resolve a route deterministically from the given inputs */
export function resolveRoute(
  channelId: string,
  accountId: string,
  peer: Peer
): ResolvedRoute {
  // Match routes by specificity (higher priority first)
  for (const route of routeTable) {
    if (route.channelId !== channelId) continue;
    if (route.accountId && route.accountId !== accountId) continue;
    if (route.peerKind && route.peerKind !== peer.kind) continue;
    if (route.peerId && route.peerId !== peer.id) continue;

    const sessionKey = buildSessionKey(channelId, accountId, peer);
    const mainSessionKey = buildMainSessionKey(channelId, accountId, peer);

    return {
      agentId: route.agentId,
      sessionKey,
      mainSessionKey,
      matchedBy: `route:priority=${route.priority},channel=${channelId},account=${route.accountId || "*"},peer=${route.peerKind || "*"}:${route.peerId || "*"}`,
    };
  }

  // Default fallback route
  const sessionKey = buildSessionKey(channelId, accountId, peer);
  const mainSessionKey = buildMainSessionKey(channelId, accountId, peer);

  return {
    agentId: "default",
    sessionKey,
    mainSessionKey,
    matchedBy: "fallback:default",
  };
}

/** Build a deterministic session key */
export function buildSessionKey(
  channelId: string,
  accountId: string,
  peer: Peer
): string {
  return `${channelId}:${accountId}:${peer.kind}:${peer.id}`;
}

/** Build a main session key (for direct chats that map to a main session) */
export function buildMainSessionKey(
  channelId: string,
  accountId: string,
  peer: Peer
): string {
  // Groups/threads remain isolated, direct chats map to user-level session
  if (peer.kind === "user") {
    return `${channelId}:${accountId}:main:${peer.id}`;
  }
  // Groups/channels/threads are isolated
  return buildSessionKey(channelId, accountId, peer);
}
