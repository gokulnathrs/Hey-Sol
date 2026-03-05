import express from "express";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs";

const AUTH_PATH = path.join(__dirname, "..", "auth_info_baileys");
const API_NODE_URL = process.env.API_NODE_URL || "http://localhost:3002";
const PORT = parseInt(process.env.PORT || "3003", 10);
const BRIDGE_URL = process.env.BRIDGE_URL || `http://localhost:${PORT}`;

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Status = "starting" | "qr" | "open" | "closed";

let currentQrDataUrl: string | null = null;
let status: Status = "starting";
let sock: ReturnType<typeof makeWASocket> | null = null;
let reconnecting = false;
let retryCount = 0;
const MAX_RETRY_DELAY = 60_000; // cap at 60 s

const silentLogger = pino({ level: "silent" });

function getRetryDelay(): number {
  const delay = Math.min(2000 * Math.pow(2, retryCount), MAX_RETRY_DELAY);
  retryCount++;
  return delay;
}

function clearAuthState(): void {
  if (fs.existsSync(AUTH_PATH)) {
    fs.rmSync(AUTH_PATH, { recursive: true, force: true });
    console.log("[WhatsApp Bridge] Cleared stale auth state");
  }
}

// ---------------------------------------------------------------------------
// WhatsApp connection
// ---------------------------------------------------------------------------

async function connectToWhatsApp(): Promise<void> {
  if (reconnecting) return;
  reconnecting = true;
  status = "starting";
  currentQrDataUrl = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: silentLogger,
      browser: ["Hey-Sol", "Chrome", "130.0.0"],
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        status = "qr";
        retryCount = 0; // reset backoff when we get a fresh QR
        currentQrDataUrl = await QRCode.toDataURL(qr);
        console.log("[WhatsApp Bridge] QR ready — scan with WhatsApp on your phone.");
      }

      if (connection === "close") {
        status = "closed";
        currentQrDataUrl = null;
        reconnecting = false;

        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        console.log(
          `[WhatsApp Bridge] Disconnected (code ${code}). Reconnect: ${shouldReconnect}`
        );

        // 405 = method not allowed / stale session — clear auth and retry fresh
        // 515 = restart required — same treatment
        if (code === 405 || code === 515) {
          clearAuthState();
        }

        if (shouldReconnect) {
          const delay = getRetryDelay();
          console.log(`[WhatsApp Bridge] Reconnecting in ${delay}ms…`);
          setTimeout(connectToWhatsApp, delay);
        }
      }

      if (connection === "open") {
        status = "open";
        currentQrDataUrl = null;
        reconnecting = false;
        retryCount = 0;
        console.log("[WhatsApp Bridge] Connected to WhatsApp!");

        // Notify api-node so it can auto-enable the channel
        try {
          await fetch(`${API_NODE_URL}/channels/whatsapp/bridge-ready`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bridgeUrl: BRIDGE_URL }),
          });
        } catch {
          // api-node might not be up yet — not critical
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    // Forward incoming messages to api-node
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";

        if (!text) continue;

        console.log(
          `[WhatsApp Bridge] Inbound from ${msg.key.remoteJid}: "${text.substring(0, 80)}"`
        );

        try {
          const res = await fetch(`${API_NODE_URL}/channels/whatsapp/inbound`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId: "default", event: msg }),
          });

          if (!res.ok) {
            console.error(
              `[WhatsApp Bridge] api-node inbound returned HTTP ${res.status}`
            );
          }
        } catch (err) {
          console.error(
            "[WhatsApp Bridge] Failed to forward message to api-node:",
            err
          );
        }
      }
    });
  } catch (err) {
    console.error("[WhatsApp Bridge] Connection error:", err);
    reconnecting = false;
    const delay = getRetryDelay();
    setTimeout(connectToWhatsApp, delay);
  }
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

/** Health check + connection status */
app.get("/status", (_req, res) => {
  res.json({ status, hasQr: currentQrDataUrl !== null });
});

/** Return the current QR code as a base64 PNG data URL */
app.get("/qr", (_req, res) => {
  if (!currentQrDataUrl) {
    res.status(404).json({ error: "No QR code available" });
    return;
  }
  res.json({ qr: currentQrDataUrl });
});

/** Send a WhatsApp message — called by api-node outbound */
app.post("/send", async (req, res) => {
  const { to, text } = req.body as { to?: string; text?: string };

  if (!to || !text) {
    res.status(400).json({ error: "to and text are required" });
    return;
  }

  if (!sock || status !== "open") {
    res.status(503).json({ error: "WhatsApp not connected" });
    return;
  }

  try {
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, { text });
    res.json({ success: true, messageId: result?.key.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[WhatsApp Bridge] Send failed: ${message}`);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[WhatsApp Bridge] HTTP server listening on port ${PORT}`);
  console.log(`[WhatsApp Bridge] Will forward inbound messages to: ${API_NODE_URL}`);
  connectToWhatsApp().catch(console.error);
});
