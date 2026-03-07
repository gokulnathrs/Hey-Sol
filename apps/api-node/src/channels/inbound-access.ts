// Inbound access control — sits above the pure dm-policy functions.
// Reads config and the pairing store, then delegates to the pure decision function.
// I/O is isolated to this layer; the core decision logic remains pure and testable.

import {
  resolveDmGroupAccessDecision,
  mergeDmAllowFromSources,
} from "./dm-policy.js";

export type InboundAccessControlResult = {
  allowed: boolean;
  shouldSendPairingChallenge: boolean;
  senderId: string;
};

/**
 * Check whether an inbound message is allowed to proceed.
 *
 * @param params.channel       Channel identifier (for logging)
 * @param params.accountId     Account within the channel
 * @param params.senderId      Normalized sender ID
 * @param params.isGroup       True when the message is from a group chat
 * @param params.groupSenderId For group messages: the participant's individual ID
 * @param params.dmPolicy      Policy governing direct messages
 * @param params.groupPolicy   Policy governing group messages
 * @param params.allowFrom     Statically configured allow-list entries
 * @param params.groupAllowFrom Optional separate allow-list for group senders
 * @param params.readPairingStore Async fn returning dynamically paired sender IDs
 * @param params.normalizeSender Fn to normalize a raw sender string to a canonical form
 */
export async function checkInboundAccess(params: {
  channel: string;
  accountId: string;
  senderId: string;
  isGroup: boolean;
  groupSenderId?: string;
  dmPolicy: string;
  groupPolicy: string;
  allowFrom: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  readPairingStore: () => Promise<Array<string | number>>;
  normalizeSender: (raw: string) => string;
}): Promise<InboundAccessControlResult> {
  // dmPolicy "allowlist" intentionally skips the pairing store (security boundary)
  const storeAllowFrom =
    params.dmPolicy === "allowlist"
      ? []
      : await params.readPairingStore().catch(() => []);

  const effectiveAllowFrom = mergeDmAllowFromSources({
    allowFrom: params.allowFrom,
    storeAllowFrom,
    dmPolicy: params.dmPolicy,
  })
    .map(params.normalizeSender)
    .filter(Boolean);

  const effectiveGroupAllowFrom = (
    params.groupAllowFrom ?? params.allowFrom ?? []
  )
    .map((v) => params.normalizeSender(String(v)))
    .filter(Boolean);

  const result = resolveDmGroupAccessDecision({
    isGroup: params.isGroup,
    dmPolicy: params.dmPolicy,
    groupPolicy: params.groupPolicy,
    effectiveAllowFrom,
    effectiveGroupAllowFrom,
    isSenderAllowed: (allowList) => {
      if (allowList.includes("*")) return true;
      const normalized = params.isGroup
        ? params.normalizeSender(params.groupSenderId ?? "")
        : params.normalizeSender(params.senderId);
      return allowList.includes(normalized);
    },
  });

  return {
    allowed: result.decision === "allow",
    shouldSendPairingChallenge: result.decision === "pairing",
    senderId: params.senderId,
  };
}
