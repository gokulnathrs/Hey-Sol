import express from 'express';
import cors from 'cors';
import {
  channelRegistry,
  loadRoutes,
  setReplyEngine,
  processInbound,
} from './channels';
import { ChannelAccountConfig, ChannelContract, DmPolicy } from './channels/types';
import { WhatsAppAdapter } from './channels/whatsapp/adapter';
import { TelegramAdapter } from './channels/telegram/adapter';
import { WebChatAdapter } from './channels/webchat/adapter';
import { setBridgeUrl } from './channels/whatsapp/outbound';

const app = express();
const PORT = 3002;
const MCP_CLIENT_URL = process.env.MCP_CLIENT_URL || "http://localhost:8002";

let activeBridgeUrl: string | null = null;

app.use(express.json());
app.use(cors());

// --- Channel configuration store (in-memory) ---

interface ChannelConfigEntry {
  channelId: string;
  label: string;
  enabled: boolean;
  config: ChannelAccountConfig;
  initialized: boolean;
  builtIn: boolean; // true = cannot be deleted
}

const channelConfigs = new Map<string, ChannelConfigEntry>();

// Per-channel conversation tracking (channelId:peerId → conversationId)
const channelConversations = new Map<string, string>();

function initDefaultConfig(channelId: string, label: string, enabledByDefault: boolean) {
  channelConfigs.set(channelId, {
    channelId,
    label,
    enabled: enabledByDefault,
    config: {
      accountId: "default",
      channelId,
      credentials: {},
      dmPolicy: "open",
    },
    initialized: enabledByDefault,
    builtIn: true,
  });
}

// --- Initialize Channel System ---

const whatsappAdapter = new WhatsAppAdapter();
const telegramAdapter = new TelegramAdapter();
const webChatAdapter = new WebChatAdapter();

channelRegistry.register(whatsappAdapter);
channelRegistry.register(telegramAdapter);
channelRegistry.register(webChatAdapter);

initDefaultConfig("webchat", "Web Chat", true);
initDefaultConfig("whatsapp", "WhatsApp", false);
initDefaultConfig("telegram", "Telegram", false);

loadRoutes([
  { channelId: "webchat", agentId: "default", priority: 1 },
  { channelId: "whatsapp", agentId: "default", priority: 1 },
  { channelId: "telegram", agentId: "default", priority: 1 },
]);

// --- Reply engine that calls MCP client ---

setReplyEngine(async (text, sessionKey, agentId) => {
  console.log(`[ReplyEngine] agent=${agentId}, session=${sessionKey}, text="${text.substring(0, 60)}"`);

  // Parse channelId and peerId from sessionKey
  const parts = sessionKey.split(":");
  const channelId = parts[0] || "unknown";
  const peerId = parts[parts.length - 1] || "unknown";

  // Look up or create a conversation for this channel+peer
  const convKey = `${channelId}:${peerId}`;
  const existingConvId = channelConversations.get(convKey);

  try {
    const resp = await fetch(`${MCP_CLIENT_URL}/channel/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        senderId: peerId,
        channelId,
        sessionKey,
        conversationId: existingConvId || undefined,
      }),
    });

    if (!resp.ok) {
      console.error(`[ReplyEngine] MCP client returned ${resp.status}`);
      return "Sorry, I couldn't process your message right now.";
    }

    const data = await resp.json();

    // Track conversation ID for future messages from this peer
    if (data.conversationId) {
      channelConversations.set(convKey, data.conversationId);
    }

    return data.response || "I received your message but have no response.";
  } catch (error) {
    console.error(`[ReplyEngine] Error calling MCP client:`, error);
    return "Sorry, the AI service is currently unavailable.";
  }
});

// --- REST API ---

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello, world!' });
});

/** List registered channels with status */
app.get('/channels', (req, res) => {
  const channels = channelRegistry.list().map((channelId) => {
    const entry = channelConfigs.get(channelId);
    return {
      channelId,
      label: entry?.label ?? channelId,
      enabled: entry?.enabled ?? false,
      initialized: entry?.initialized ?? false,
      dmPolicy: entry?.config.dmPolicy ?? "open",
      hasCredentials: Object.keys(entry?.config.credentials ?? {}).length > 0,
      builtIn: entry?.builtIn ?? false,
    };
  });
  res.json({ channels });
});

/** Get individual channel details */
app.get('/channels/:channelId', (req, res) => {
  const { channelId } = req.params;

  if (!channelRegistry.has(channelId)) {
    res.status(404).json({ error: `Channel not found: ${channelId}` });
    return;
  }

  const entry = channelConfigs.get(channelId);
  const safeCredentials: Record<string, string> = {};
  if (entry?.config.credentials) {
    for (const key of Object.keys(entry.config.credentials)) {
      safeCredentials[key] = "••••••••";
    }
  }

  res.json({
    channelId,
    label: entry?.label ?? channelId,
    enabled: entry?.enabled ?? false,
    initialized: entry?.initialized ?? false,
    dmPolicy: entry?.config.dmPolicy ?? "open",
    accountId: entry?.config.accountId ?? "default",
    credentials: safeCredentials,
    configFields: getConfigFields(channelId),
    builtIn: entry?.builtIn ?? false,
  });
});

/** Create a new custom channel */
app.post('/channels', (req, res) => {
  const { channelId, label, baseAdapter } = req.body;

  if (!channelId || typeof channelId !== "string") {
    res.status(400).json({ error: "channelId is required" });
    return;
  }

  // Sanitize channelId: lowercase, alphanumeric + hyphens only
  const sanitized = channelId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (sanitized !== channelId) {
    res.status(400).json({ error: "channelId must be lowercase alphanumeric with hyphens only" });
    return;
  }

  if (channelRegistry.has(sanitized)) {
    res.status(409).json({ error: `Channel "${sanitized}" already exists` });
    return;
  }

  // Create adapter based on baseAdapter type
  let adapter: ChannelContract;
  switch (baseAdapter) {
    case "whatsapp":
      adapter = new (class extends WhatsAppAdapter {
        readonly channelId = sanitized;
      })();
      break;
    case "telegram":
      adapter = new (class extends TelegramAdapter {
        readonly channelId = sanitized;
      })();
      break;
    default:
      adapter = new (class extends WebChatAdapter {
        readonly channelId = sanitized;
      })();
      break;
  }

  channelRegistry.register(adapter);
  loadRoutes([{ channelId: sanitized, agentId: "default", priority: 1 }]);

  channelConfigs.set(sanitized, {
    channelId: sanitized,
    label: label || sanitized,
    enabled: false,
    config: {
      accountId: "default",
      channelId: sanitized,
      credentials: {},
      dmPolicy: "open",
    },
    initialized: false,
    builtIn: false,
  });

  console.log(`[API] Created custom channel: ${sanitized} (base: ${baseAdapter || "webchat"})`);
  res.status(201).json({ status: "created", channelId: sanitized });
});

/** Delete a channel */
app.delete('/channels/:channelId', (req, res) => {
  const { channelId } = req.params;

  const entry = channelConfigs.get(channelId);
  if (!entry) {
    res.status(404).json({ error: `Channel not found: ${channelId}` });
    return;
  }

  if (entry.builtIn) {
    res.status(403).json({ error: `Cannot delete built-in channel: ${channelId}` });
    return;
  }

  channelConfigs.delete(channelId);
  channelRegistry.remove(channelId);
  console.log(`[API] Deleted channel: ${channelId}`);
  res.json({ status: "deleted", channelId });
});

/** Update channel configuration */
app.put('/channels/:channelId/config', (req, res) => {
  const { channelId } = req.params;

  if (!channelRegistry.has(channelId)) {
    res.status(404).json({ error: `Channel not found: ${channelId}` });
    return;
  }

  const { credentials, dmPolicy, accountId, enabled, label } = req.body;
  const entry = channelConfigs.get(channelId);
  if (!entry) {
    res.status(404).json({ error: `No config for channel: ${channelId}` });
    return;
  }

  const validPolicies: DmPolicy[] = ["pairing", "allowlist", "open", "disabled"];
  if (dmPolicy && !validPolicies.includes(dmPolicy)) {
    res.status(400).json({ error: `Invalid dmPolicy. Must be one of: ${validPolicies.join(", ")}` });
    return;
  }

  if (credentials && typeof credentials === "object") {
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === "string" && value !== "••••••••") {
        entry.config.credentials[key] = value;
      }
    }
  }
  if (dmPolicy) entry.config.dmPolicy = dmPolicy;
  if (accountId) entry.config.accountId = accountId;
  if (typeof enabled === "boolean") entry.enabled = enabled;
  if (label && typeof label === "string") entry.label = label;

  channelConfigs.set(channelId, entry);
  console.log(`[API] Updated config for channel: ${channelId}`);

  res.json({ status: "updated", channelId });
});

/** Initialize (activate) a channel */
app.post('/channels/:channelId/initialize', async (req, res) => {
  const { channelId } = req.params;

  if (!channelRegistry.has(channelId)) {
    res.status(404).json({ error: `Channel not found: ${channelId}` });
    return;
  }

  const entry = channelConfigs.get(channelId);
  if (!entry) {
    res.status(404).json({ error: `No config for channel: ${channelId}` });
    return;
  }

  try {
    const adapter = channelRegistry.get(channelId);

    // Wire Telegram long-poll callback BEFORE initialize so it's set when polling starts
    if (adapter instanceof TelegramAdapter) {
      adapter.onMessage = processInbound;
      console.log(`[API] Wired onMessage handler for Telegram channel: ${channelId}`);
    }

    await adapter.initialize(entry.config);

    entry.initialized = true;
    entry.enabled = true;
    channelConfigs.set(channelId, entry);

    console.log(`[API] Initialized channel: ${channelId}`);
    res.json({ status: "initialized", channelId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[API] Init error for ${channelId}: ${message}`);
    res.status(500).json({ error: message });
  }
});

/** Return the expected config fields for a channel */
function getConfigFields(channelId: string): { key: string; label: string; type: string; required: boolean }[] {
  // Check base adapter type from config
  const entry = channelConfigs.get(channelId);
  const effectiveId = entry?.builtIn ? channelId : getBaseAdapterType(channelId);

  switch (effectiveId) {
    case "whatsapp":
      return [
        { key: "bridgeUrl", label: "Bridge URL", type: "text", required: false },
      ];
    case "telegram":
      return [
        { key: "botToken", label: "Bot Token", type: "password", required: true },
      ];
    case "webchat":
      return [];
    default:
      return [];
  }
}

/** Infer the base adapter type from a channel's adapter */
function getBaseAdapterType(channelId: string): string {
  try {
    const adapter = channelRegistry.get(channelId);
    if (adapter instanceof WhatsAppAdapter) return "whatsapp";
    if (adapter instanceof TelegramAdapter) return "telegram";
    if (adapter instanceof WebChatAdapter) return "webchat";
  } catch { /* not registered */ }
  return "webchat";
}

/** Called by whatsapp-bridge when it connects — auto-enables the channel */
app.post('/channels/whatsapp/bridge-ready', async (req, res) => {
  const { bridgeUrl } = req.body as { bridgeUrl?: string };
  const url = bridgeUrl || 'http://localhost:3003';
  activeBridgeUrl = url;
  setBridgeUrl(url);

  const entry = channelConfigs.get('whatsapp');
  if (entry) {
    entry.enabled = true;
    entry.initialized = true;
    entry.config.credentials['bridgeUrl'] = url;
    channelConfigs.set('whatsapp', entry);
  }

  console.log(`[API] WhatsApp bridge ready: ${url}`);
  res.json({ status: 'ok' });
});

/** Proxy QR code from the bridge */
app.get('/channels/whatsapp/qr', async (req, res) => {
  const bridgeUrl = activeBridgeUrl || 'http://localhost:3003';
  try {
    const response = await fetch(`${bridgeUrl}/qr`);
    if (!response.ok) {
      res.status(404).json({ error: 'No QR code available' });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ error: 'Bridge not reachable' });
  }
});

/** Proxy bridge status */
app.get('/channels/whatsapp/bridge-status', async (req, res) => {
  const bridgeUrl = activeBridgeUrl || 'http://localhost:3003';
  try {
    const response = await fetch(`${bridgeUrl}/status`);
    const data = await response.json();
    res.json({ ...(data as object), bridgeUrl });
  } catch {
    res.json({ status: 'offline', bridgeUrl });
  }
});

/** Generic inbound endpoint — accepts messages from any channel */
app.post('/channels/:channelId/inbound', async (req, res) => {
  const { channelId } = req.params;
  const { accountId, event } = req.body;

  if (!channelRegistry.has(channelId)) {
    res.status(400).json({ error: `Unknown channel: ${channelId}` });
    return;
  }

  const entry = channelConfigs.get(channelId);
  if (!entry?.enabled) {
    res.status(403).json({ error: `Channel ${channelId} is not enabled` });
    return;
  }

  try {
    const adapter = channelRegistry.get(channelId);
    const inbound = adapter.normalizeInbound(event, accountId || "default");

    if (!adapter.checkDmPolicy(inbound.senderId, entry.config)) {
      res.status(403).json({ error: "Message blocked by DM policy" });
      return;
    }

    await processInbound(inbound);
    res.json({ status: "processed", channelId, peerId: inbound.peerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[API] Inbound error: ${message}`);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Registered channels: ${channelRegistry.list().join(", ")}`);
  console.log(`MCP Client URL: ${MCP_CLIENT_URL}`);
});