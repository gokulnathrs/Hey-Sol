// WhatsApp account config resolution

import { ChannelAccountConfig, DmPolicy } from "../types";

/** Default WhatsApp account configs (in production, load from DB/env) */
const accountConfigs = new Map<string, ChannelAccountConfig>();

/** Register a WhatsApp account config */
export function registerWhatsAppAccount(config: ChannelAccountConfig): void {
  accountConfigs.set(config.accountId, config);
  console.log(`[WhatsApp] Registered account: ${config.accountId}`);
}

/** Resolve account config by ID, or return default */
export function resolveWhatsAppAccount(accountId: string): ChannelAccountConfig {
  const config = accountConfigs.get(accountId);
  if (!config) {
    // Return a default config
    return {
      accountId,
      channelId: "whatsapp",
      credentials: {},
      dmPolicy: "open",
    };
  }
  return config;
}

/** Get the DM policy for an account */
export function getWhatsAppDmPolicy(accountId: string): DmPolicy {
  return resolveWhatsAppAccount(accountId).dmPolicy;
}
