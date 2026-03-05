// Channel registry — register and look up channel adapters by channelId

import { ChannelContract, ChannelAccountConfig } from "./types";

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
