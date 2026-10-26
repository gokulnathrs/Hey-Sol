// Channel registry — register and look up channel adapters by channelId

import { ChannelContract, ChannelAccountConfig } from "./types";
import { ChannelPlugin, ChannelId } from "./types";

// ---------------------------------------------------------------------------
// Plugin registry (new composition-based API)
// ---------------------------------------------------------------------------

const plugins = new Map<string, ChannelPlugin>();

/** Register a channel plugin */
export function registerPlugin(plugin: ChannelPlugin): void {
  plugins.set(plugin.id.trim().toLowerCase(), plugin);
}

/** Look up a channel plugin by id */
export function getChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  return plugins.get(id.trim().toLowerCase());
}

/** Sorted list of all registered plugins (by meta.order, then id) */
export function listChannelPlugins(): ChannelPlugin[] {
  return [...plugins.values()].sort((a, b) => {
    const orderA = a.meta.order ?? 999;
    const orderB = b.meta.order ?? 999;
    return orderA !== orderB ? orderA - orderB : a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Legacy class-based registry (kept for backward compatibility)
// ---------------------------------------------------------------------------

class ChannelRegistry {
  private adapters = new Map<string, ChannelContract>();

  /** Register a channel adapter */
  register(adapter: ChannelContract): void {
    if (this.adapters.has(adapter.channelId)) {
      throw new Error(`Channel "${adapter.channelId}" is already registered`);
    }
    this.adapters.set(adapter.channelId, adapter);
    console.log(`[ChannelRegistry] Registered channel: ${adapter.channelId}`);
  }

  /** Get an adapter by channel ID */
  get(channelId: string): ChannelContract {
    const adapter = this.adapters.get(channelId);
    if (!adapter) {
      throw new Error(`Channel "${channelId}" is not registered`);
    }
    return adapter;
  }

  /** Check if a channel is registered */
  has(channelId: string): boolean {
    return this.adapters.has(channelId);
  }

  /** List all registered channel IDs */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Remove a channel adapter */
  remove(channelId: string): boolean {
    const removed = this.adapters.delete(channelId);
    if (removed) {
      console.log(`[ChannelRegistry] Removed channel: ${channelId}`);
    }
    return removed;
  }
}

// Singleton registry
export const channelRegistry = new ChannelRegistry();
