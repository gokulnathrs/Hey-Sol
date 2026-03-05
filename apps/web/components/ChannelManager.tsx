"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  MessageCircle,
  Phone,
  Send as SendIcon,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Shield,
  Zap,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { BACKEND_URL } from "@hey-sol/shared";

interface ChannelInfo {
  channelId: string;
  label: string;
  enabled: boolean;
  initialized: boolean;
  dmPolicy: string;
  hasCredentials: boolean;
  builtIn: boolean;
}

interface ConfigField {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

interface ChannelDetail {
  channelId: string;
  label: string;
  enabled: boolean;
  initialized: boolean;
  dmPolicy: string;
  accountId: string;
  credentials: Record<string, string>;
  configFields: ConfigField[];
  builtIn: boolean;
}

const CHANNEL_META: Record<
  string,
  { icon: React.ReactNode; description: string; color: string }
> = {
  whatsapp: {
    icon: <Phone className="size-5" />,
    description: "Connect via WhatsApp Business API or Baileys",
    color: "text-green-400",
  },
  telegram: {
    icon: <SendIcon className="size-5" />,
    description: "Connect via Telegram Bot API",
    color: "text-blue-400",
  },
  webchat: {
    icon: <Globe className="size-5" />,
    description: "Built-in browser chat — always available",
    color: "text-sol-purple",
  },
};

function getChannelMeta(channelId: string) {
  return (
    CHANNEL_META[channelId] ?? {
      icon: <MessageCircle className="size-5" />,
      description: "Custom channel",
      color: "text-foreground/70",
    }
  );
}

type View = "list" | "detail" | "create";

type ChannelManagerProps = {
  isOpen: boolean;
  onClose: () => void;
};

const ChannelManager: React.FC<ChannelManagerProps> = ({ isOpen, onClose }) => {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelDetail, setChannelDetail] = useState<ChannelDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Form state (edit)
  const [formCredentials, setFormCredentials] = useState<Record<string, string>>({});
  const [formDmPolicy, setFormDmPolicy] = useState("open");
  const [formEnabled, setFormEnabled] = useState(false);
  const [formLabel, setFormLabel] = useState("");

  // Create form state
  const [createId, setCreateId] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [createBaseAdapter, setCreateBaseAdapter] = useState("webchat");
  const [createError, setCreateError] = useState("");

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/channels`);
      const data = await res.json();
      setChannels(data.channels);
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchChannels();
      setView("list");
      setSelectedChannel(null);
      setDeleteConfirm(null);
    }
  }, [isOpen, fetchChannels]);

  const fetchChannelDetail = async (channelId: string) => {
    try {
      setDetailLoading(true);
      const res = await fetch(`${BACKEND_URL}/channels/${channelId}`);
      const data: ChannelDetail = await res.json();
      setChannelDetail(data);
      setFormCredentials({ ...data.credentials });
      setFormDmPolicy(data.dmPolicy);
      setFormEnabled(data.enabled);
      setFormLabel(data.label);
    } catch (err) {
      console.error("Failed to fetch channel detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannel(channelId);
    setView("detail");
    setSaveStatus("idle");
    setDeleteConfirm(null);
    fetchChannelDetail(channelId);
  };

  const handleSave = async () => {
    if (!selectedChannel) return;
    try {
      setSaving(true);
      setSaveStatus("idle");
      const res = await fetch(`${BACKEND_URL}/channels/${selectedChannel}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: formCredentials,
          dmPolicy: formDmPolicy,
          enabled: formEnabled,
          label: formLabel,
        }),
      });
      if (res.ok) {
        setSaveStatus("success");
        fetchChannels();
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleInitialize = async () => {
    if (!selectedChannel) return;
    try {
      setSaving(true);
      const res = await fetch(`${BACKEND_URL}/channels/${selectedChannel}/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setSaveStatus("success");
        fetchChannels();
        fetchChannelDetail(selectedChannel);
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreateError("");
    if (!createId.trim()) {
      setCreateError("Channel ID is required");
      return;
    }
    const sanitized = createId.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (sanitized !== createId) {
      setCreateError("ID must be lowercase letters, numbers, and hyphens only");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${BACKEND_URL}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: sanitized,
          label: createLabel || sanitized,
          baseAdapter: createBaseAdapter,
        }),
      });
      if (res.ok) {
        setCreateId("");
        setCreateLabel("");
        setCreateBaseAdapter("webchat");
        await fetchChannels();
        setView("list");
      } else {
        const data = await res.json();
        setCreateError(data.error || "Failed to create channel");
      }
    } catch {
      setCreateError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (channelId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/channels/${channelId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteConfirm(null);
        await fetchChannels();
        if (selectedChannel === channelId) {
          setView("list");
          setSelectedChannel(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete channel:", err);
    }
  };

  if (!isOpen) return null;

  const headerTitle =
    view === "create" ? "New Channel" : view === "detail" ? channelDetail?.label || "Channel" : "Channels";

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l border-foreground/10 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/10">
          {view !== "list" ? (
            <button
              onClick={() => { setView("list"); setSelectedChannel(null); setDeleteConfirm(null); }}
              className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span className="text-sm font-poppins">{headerTitle}</span>
            </button>
          ) : (
            <h2 className="text-lg font-darker-grotesque font-semibold text-foreground/90">
              Channels
            </h2>
          )}
          <div className="flex items-center gap-1">
            {view === "list" && (
              <button
                onClick={() => { setView("create"); setCreateError(""); }}
                className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/60 hover:text-sol-green transition-colors"
                title="Add channel"
              >
                <Plus className="size-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/60 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === "detail" && selectedChannel ? (
            <ChannelDetailView
              channelId={selectedChannel}
              detail={channelDetail}
              loading={detailLoading}
              formCredentials={formCredentials}
              setFormCredentials={setFormCredentials}
              formDmPolicy={formDmPolicy}
              setFormDmPolicy={setFormDmPolicy}
              formEnabled={formEnabled}
              setFormEnabled={setFormEnabled}
              formLabel={formLabel}
              setFormLabel={setFormLabel}
              deleteConfirm={deleteConfirm}
              setDeleteConfirm={setDeleteConfirm}
              onDelete={handleDelete}
            />
          ) : view === "create" ? (
            <CreateChannelView
              createId={createId}
              setCreateId={setCreateId}
              createLabel={createLabel}
              setCreateLabel={setCreateLabel}
              createBaseAdapter={createBaseAdapter}
              setCreateBaseAdapter={setCreateBaseAdapter}
              error={createError}
            />
          ) : (
            <div className="p-4 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-foreground/40" />
                </div>
              ) : channels.length === 0 ? (
                <div className="text-center py-12 text-foreground/40 text-sm">
                  No channels registered
                </div>
              ) : (
                channels.map((ch) => {
                  const meta = getChannelMeta(ch.channelId);
                  return (
                    <button
                      key={ch.channelId}
                      onClick={() => handleSelectChannel(ch.channelId)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl
                                 border border-foreground/5 hover:border-foreground/15
                                 bg-foreground/[0.02] hover:bg-foreground/[0.05]
                                 transition-all duration-200 group text-left"
                    >
                      <div className={`p-2.5 rounded-xl bg-foreground/5 ${meta.color}`}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-poppins font-medium text-foreground/90">
                            {ch.label}
                          </p>
                          {!ch.builtIn && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-foreground/5 text-foreground/30">
                              CUSTOM
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              ch.enabled
                                ? "bg-sol-green/15 text-sol-green"
                                : "bg-foreground/5 text-foreground/40"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                ch.enabled ? "bg-sol-green" : "bg-foreground/30"
                              }`}
                            />
                            {ch.enabled ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/40 mt-0.5 truncate">
                          {meta.description}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-foreground/20 group-hover:text-foreground/40 transition-colors" />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {view === "detail" && selectedChannel && !detailLoading && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-foreground/10">
            {!channelDetail?.initialized && selectedChannel !== "webchat" && (
              <button
                onClick={handleInitialize}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-sol-purple/15 text-sol-purple hover:bg-sol-purple/25
                           font-poppins text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                Initialize
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-gradient-to-r from-sol-purple to-sol-green text-white
                         font-poppins text-sm font-medium transition-opacity disabled:opacity-50
                         hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saveStatus === "success" ? (
                <>
                  <Check className="size-4" /> Saved
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="size-4" /> Failed
                </>
              ) : (
                "Save Configuration"
              )}
            </button>
          </div>
        )}

        {view === "create" && (
          <div className="px-5 py-4 border-t border-foreground/10">
            <button
              onClick={handleCreate}
              disabled={saving || !createId.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-gradient-to-r from-sol-purple to-sol-green text-white
                         font-poppins text-sm font-medium transition-opacity disabled:opacity-50
                         hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" /> Create Channel
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// --- Create Channel View ---

function CreateChannelView({
  createId,
  setCreateId,
  createLabel,
  setCreateLabel,
  createBaseAdapter,
  setCreateBaseAdapter,
  error,
}: {
  createId: string;
  setCreateId: (v: string) => void;
  createLabel: string;
  setCreateLabel: (v: string) => void;
  createBaseAdapter: string;
  setCreateBaseAdapter: (v: string) => void;
  error: string;
}) {
  return (
    <div className="p-5 space-y-5">
      <p className="text-xs text-foreground/40 font-poppins">
        Create a new channel to receive and send messages from external platforms.
      </p>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-poppins">
          <AlertCircle className="size-3.5" />
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-foreground/50 font-poppins">
          Channel ID <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={createId}
          onChange={(e) => setCreateId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="my-whatsapp-bot"
          className="w-full px-3 py-2.5 rounded-xl bg-foreground/5 border border-foreground/10
                     text-sm text-foreground/90 placeholder:text-foreground/25
                     focus:outline-none focus:border-sol-purple/40 transition-colors font-poppins"
        />
        <p className="text-[10px] text-foreground/30 font-poppins">
          Lowercase letters, numbers, and hyphens only
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-foreground/50 font-poppins">Display Name</label>
        <input
          type="text"
          value={createLabel}
          onChange={(e) => setCreateLabel(e.target.value)}
          placeholder="My WhatsApp Bot"
          className="w-full px-3 py-2.5 rounded-xl bg-foreground/5 border border-foreground/10
                     text-sm text-foreground/90 placeholder:text-foreground/25
                     focus:outline-none focus:border-sol-purple/40 transition-colors font-poppins"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-foreground/50 font-poppins">Base Adapter</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "whatsapp", label: "WhatsApp", color: "text-green-400" },
            { id: "telegram", label: "Telegram", color: "text-blue-400" },
            { id: "webchat", label: "Web Chat", color: "text-sol-purple" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setCreateBaseAdapter(opt.id)}
              className={`px-3 py-2.5 rounded-lg text-xs font-poppins font-medium transition-all ${
                createBaseAdapter === opt.id
                  ? "bg-sol-purple/15 text-sol-purple border border-sol-purple/30"
                  : "bg-foreground/5 text-foreground/50 border border-transparent hover:border-foreground/10"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-foreground/30 font-poppins">
          Determines the message format and transport protocol used
        </p>
      </div>
    </div>
  );
}

// --- Channel Detail View ---

function ChannelDetailView({
  channelId,
  detail,
  loading,
  formCredentials,
  setFormCredentials,
  formDmPolicy,
  setFormDmPolicy,
  formEnabled,
  setFormEnabled,
  formLabel,
  setFormLabel,
  deleteConfirm,
  setDeleteConfirm,
  onDelete,
}: {
  channelId: string;
  detail: ChannelDetail | null;
  loading: boolean;
  formCredentials: Record<string, string>;
  setFormCredentials: (v: Record<string, string>) => void;
  formDmPolicy: string;
  setFormDmPolicy: (v: string) => void;
  formEnabled: boolean;
  setFormEnabled: (v: boolean) => void;
  formLabel: string;
  setFormLabel: (v: string) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (v: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const meta = getChannelMeta(channelId);

  // WhatsApp QR polling
  const [bridgeStatus, setBridgeStatus] = useState<"offline" | "starting" | "qr" | "open">("offline");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollBridgeStatus = useCallback(async () => {
    if (channelId !== "whatsapp") return;
    try {
      const res = await fetch(`${BACKEND_URL}/channels/whatsapp/bridge-status`);
      if (!res.ok) { setBridgeStatus("offline"); return; }
      const data = await res.json() as { status?: string };
      const s = (data.status || "offline") as typeof bridgeStatus;
      setBridgeStatus(s);

      if (s === "qr") {
        const qrRes = await fetch(`${BACKEND_URL}/channels/whatsapp/qr`);
        if (qrRes.ok) {
          const qrData = await qrRes.json() as { qr?: string };
          if (qrData.qr) setQrDataUrl(qrData.qr);
        }
      } else {
        setQrDataUrl(null);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }, [channelId]);

  useEffect(() => {
    if (channelId !== "whatsapp" || loading || !detail) return;
    pollBridgeStatus();
    qrPollRef.current = setInterval(pollBridgeStatus, 4000);
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, [channelId, loading, detail, pollBridgeStatus]);

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      {/* Channel header */}
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl bg-foreground/5 ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-poppins font-semibold text-foreground/90">
            {detail.label}
          </h3>
          <p className="text-xs text-foreground/40 mt-0.5">{meta.description}</p>
        </div>
      </div>

      {/* Telegram polling status */}
      {channelId === "telegram" && (
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-poppins text-foreground/50">Bot API (Long-polling)</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  detail.initialized ? "bg-sol-green" : "bg-foreground/20"
                }`}
              />
              <span className="text-xs font-poppins text-foreground/60">
                {detail.initialized ? "Polling active" : "Not started"}
              </span>
            </div>
          </div>

          {detail.initialized ? (
            <p className="text-xs text-sol-green font-poppins text-center">
              Connected — Telegram messages are received via long-polling (no webhook needed)
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-foreground/50 font-poppins font-medium">How to set up your Telegram bot:</p>
              <ol className="space-y-1 text-xs text-foreground/40 font-poppins list-decimal list-inside">
                <li>
                  Message{" "}
                  <span className="text-blue-400 font-medium">@BotFather</span> on Telegram →{" "}
                  <code className="font-mono text-foreground/60">/newbot</code>
                </li>
                <li>Copy the Bot Token and paste it in the field below</li>
                <li>Click <span className="text-foreground/60">Save Configuration</span>, then <span className="text-sol-purple">Initialize</span></li>
              </ol>
              <p className="text-[10px] text-foreground/30 font-poppins pt-1">
                No webhook, ngrok, or public URL required — long-polling works locally
              </p>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp QR / connection status */}
      {channelId === "whatsapp" && (
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-poppins text-foreground/50">Baileys Bridge</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  bridgeStatus === "open"
                    ? "bg-sol-green"
                    : bridgeStatus === "qr" || bridgeStatus === "starting"
                    ? "bg-yellow-400 animate-pulse"
                    : "bg-foreground/20"
                }`}
              />
              <span className="text-xs font-poppins text-foreground/60 capitalize">{bridgeStatus}</span>
              <button onClick={pollBridgeStatus} className="ml-1 text-foreground/30 hover:text-foreground/60 transition-colors">
                <RefreshCw className="size-3" />
              </button>
            </div>
          </div>

          {bridgeStatus === "qr" && qrDataUrl && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-foreground/50 font-poppins text-center">
                Open WhatsApp → Linked Devices → Link a Device and scan
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="WhatsApp QR code"
                className="w-48 h-48 rounded-xl border border-foreground/10 bg-white p-2"
              />
            </div>
          )}

          {bridgeStatus === "open" && (
            <p className="text-xs text-sol-green font-poppins text-center">
              Connected — WhatsApp messages will be routed to Hey-Sol
            </p>
          )}

          {bridgeStatus === "offline" && (
            <p className="text-xs text-foreground/40 font-poppins">
              Start the bridge:{" "}
              <code className="font-mono text-foreground/60">cd apps/whatsapp-bridge && pnpm dev</code>
            </p>
          )}

          {bridgeStatus === "starting" && (
            <div className="flex items-center gap-2 justify-center">
              <Loader2 className="size-4 animate-spin text-yellow-400" />
              <span className="text-xs font-poppins text-foreground/50">Connecting…</span>
            </div>
          )}
        </div>
      )}

      {/* Label */}
      <div className="space-y-1.5">
        <label className="text-xs text-foreground/50 font-poppins">Display Name</label>
        <input
          type="text"
          value={formLabel}
          onChange={(e) => setFormLabel(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-foreground/5 border border-foreground/10
                     text-sm text-foreground/90 placeholder:text-foreground/25
                     focus:outline-none focus:border-sol-purple/40 transition-colors font-poppins"
        />
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-foreground/10 bg-foreground/[0.02]">
        <div className="flex items-center gap-3">
          <Zap className="size-4 text-foreground/50" />
          <span className="text-sm font-poppins text-foreground/80">Enabled</span>
        </div>
        <button
          onClick={() => setFormEnabled(!formEnabled)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            formEnabled ? "bg-sol-green" : "bg-foreground/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
              formEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* DM Policy */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-foreground/60">
          <Shield className="size-4" />
          <label className="text-sm font-poppins font-medium">DM Policy</label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["open", "pairing", "allowlist", "disabled"] as const).map((policy) => (
            <button
              key={policy}
              onClick={() => setFormDmPolicy(policy)}
              className={`px-3 py-2 rounded-lg text-xs font-poppins font-medium capitalize transition-all ${
                formDmPolicy === policy
                  ? "bg-sol-purple/15 text-sol-purple border border-sol-purple/30"
                  : "bg-foreground/5 text-foreground/50 border border-transparent hover:border-foreground/10"
              }`}
            >
              {policy}
            </button>
          ))}
        </div>
      </div>

      {/* Credential fields */}
      {detail.configFields.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-poppins font-medium text-foreground/60">Credentials</h4>
          {detail.configFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-xs text-foreground/50 font-poppins flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type={field.type === "password" ? "password" : "text"}
                value={formCredentials[field.key] ?? ""}
                onChange={(e) =>
                  setFormCredentials({ ...formCredentials, [field.key]: e.target.value })
                }
                placeholder={`Enter ${field.label.toLowerCase()}`}
                className="w-full px-3 py-2.5 rounded-xl bg-foreground/5 border border-foreground/10
                           text-sm text-foreground/90 placeholder:text-foreground/25
                           focus:outline-none focus:border-sol-purple/40 transition-colors font-poppins"
              />
            </div>
          ))}
        </div>
      )}

      {/* Status info */}
      <div className="px-4 py-3 rounded-xl bg-foreground/[0.02] border border-foreground/5 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-foreground/40">Status</span>
          <span className={detail.initialized ? "text-sol-green" : "text-foreground/50"}>
            {detail.initialized ? "Initialized" : "Not initialized"}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground/40">Channel ID</span>
          <span className="text-foreground/60 font-mono text-[11px]">{detail.channelId}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground/40">Account ID</span>
          <span className="text-foreground/60">{detail.accountId}</span>
        </div>
      </div>

      {/* Delete channel (only for custom channels) */}
      {!detail.builtIn && (
        <div className="pt-2">
          {deleteConfirm === channelId ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400 font-poppins flex-1">
                Delete this channel permanently?
              </span>
              <button
                onClick={() => onDelete(channelId)}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-poppins font-medium hover:bg-red-500/25 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-lg bg-foreground/5 text-foreground/50 text-xs font-poppins font-medium hover:bg-foreground/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(channelId)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                         border border-red-500/20 text-red-400/70 hover:text-red-400 hover:bg-red-500/5
                         font-poppins text-sm font-medium transition-colors"
            >
              <Trash2 className="size-4" />
              Delete Channel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ChannelManager;
