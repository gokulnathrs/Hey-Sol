// DM and Group access control — pure, stateless, fully unit-testable.
// No I/O here: all state (allowlists, pairing store contents) is passed in.

export type DmGroupAccessDecision = "allow" | "block" | "pairing";

export const DM_GROUP_ACCESS_REASON = {
  GROUP_POLICY_ALLOWED: "group_policy_allowed",
  GROUP_POLICY_DISABLED: "group_policy_disabled",
  GROUP_POLICY_EMPTY_ALLOWLIST: "group_policy_empty_allowlist",
  GROUP_POLICY_NOT_ALLOWLISTED: "group_policy_not_allowlisted",
  DM_POLICY_OPEN: "dm_policy_open",
  DM_POLICY_DISABLED: "dm_policy_disabled",
  DM_POLICY_ALLOWLISTED: "dm_policy_allowlisted",
  DM_POLICY_PAIRING_REQUIRED: "dm_policy_pairing_required",
  DM_POLICY_NOT_ALLOWLISTED: "dm_policy_not_allowlisted",
} as const;

export type DmGroupAccessReasonCode =
  (typeof DM_GROUP_ACCESS_REASON)[keyof typeof DM_GROUP_ACCESS_REASON];

/**
 * Pure decision function. No I/O. All inputs resolved before calling.
 *
 * dmPolicy values:
 *   "disabled"  — block all DMs
 *   "pairing"   — require a pairing handshake for unknown senders (default)
 *   "allowlist" — only explicitly listed senders allowed
 *   "open"      — anyone can DM (requires allowFrom: ["*"] in config)
 *
 * groupPolicy values:
 *   "open"      — all group messages pass through
 *   "allowlist" — only senders in groupAllowFrom
 *   "disabled"  — block all group messages
 *
 * Group policy is evaluated first when isGroup=true; DM policy is skipped.
 */
export function resolveDmGroupAccessDecision(params: {
  isGroup: boolean;
  dmPolicy?: string | null;
  groupPolicy?: string | null;
  effectiveAllowFrom: string[];
  effectiveGroupAllowFrom: string[];
  isSenderAllowed: (allowFrom: string[]) => boolean;
}): {
  decision: DmGroupAccessDecision;
  reasonCode: DmGroupAccessReasonCode;
  reason: string;
} {
  const dmPolicy = params.dmPolicy ?? "pairing";
  const groupPolicy = params.groupPolicy ?? "allowlist";

  if (params.isGroup) {
    if (groupPolicy === "disabled") {
      return {
        decision: "block",
        reasonCode: DM_GROUP_ACCESS_REASON.GROUP_POLICY_DISABLED,
        reason: "groupPolicy=disabled",
      };
    }
    if (groupPolicy === "allowlist") {
      if (params.effectiveGroupAllowFrom.length === 0) {
        return {
          decision: "block",
          reasonCode: DM_GROUP_ACCESS_REASON.GROUP_POLICY_EMPTY_ALLOWLIST,
          reason: "groupPolicy=allowlist (empty)",
        };
      }
      if (!params.isSenderAllowed(params.effectiveGroupAllowFrom)) {
        return {
          decision: "block",
          reasonCode: DM_GROUP_ACCESS_REASON.GROUP_POLICY_NOT_ALLOWLISTED,
          reason: "groupPolicy=allowlist (not allowlisted)",
        };
      }
    }
    return {
      decision: "allow",
      reasonCode: DM_GROUP_ACCESS_REASON.GROUP_POLICY_ALLOWED,
      reason: `groupPolicy=${groupPolicy}`,
    };
  }

  // DM path
  if (dmPolicy === "disabled") {
    return {
      decision: "block",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_DISABLED,
      reason: "dmPolicy=disabled",
    };
  }
  if (dmPolicy === "open") {
    return {
      decision: "allow",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_OPEN,
      reason: "dmPolicy=open",
    };
  }
  if (params.isSenderAllowed(params.effectiveAllowFrom)) {
    return {
      decision: "allow",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_ALLOWLISTED,
      reason: `dmPolicy=${dmPolicy} (allowlisted)`,
    };
  }
  if (dmPolicy === "pairing") {
    return {
      decision: "pairing",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_PAIRING_REQUIRED,
      reason: "dmPolicy=pairing (not allowlisted)",
    };
  }
  return {
    decision: "block",
    reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_NOT_ALLOWLISTED,
    reason: `dmPolicy=${dmPolicy} (not allowlisted)`,
  };
}

/**
 * Merges static config allowFrom with dynamic pairing-store entries.
 *
 * Security property: when dmPolicy === "allowlist", the pairing store is
 * intentionally ignored so that only statically configured senders can DM.
 */
export function mergeDmAllowFromSources(params: {
  allowFrom?: Array<string | number>;
  storeAllowFrom?: Array<string | number>;
  dmPolicy?: string;
}): string[] {
  const storeEntries =
    params.dmPolicy === "allowlist" ? [] : (params.storeAllowFrom ?? []);
  return [...(params.allowFrom ?? []), ...storeEntries]
    .map((v) => String(v).trim())
    .filter(Boolean);
}
