"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWalletMode, type WalletMode } from "@/lib/wallet-mode";

/**
 * Shows the signed-in user's avatar + wallet public key (truncated),
 * or a "Sign in" button when unauthenticated.
 */
export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const { mode, setMode } = useWalletMode();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [addressCopyStatus, setAddressCopyStatus] = useState<"idle" | "done" | "error">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "error">("idle");
  const [signOutLoading, setSignOutLoading] = useState(false);

  const modeWarning = useMemo(() => {
    if (mode !== "adapter") return null;
    return "Adapter mode may not support managed signing/audit features for all flows.";
  }, [mode]);

  useEffect(() => {
    if (!session?.user || !open) return;

    let active = true;
    const loadBalance = async () => {
      setBalanceLoading(true);
      try {
        const res = await fetch("/api/wallet/balance", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (res.ok && typeof data.sol === "number") {
          setBalanceSol(data.sol);
        } else {
          setBalanceSol(null);
        }
      } catch {
        if (active) setBalanceSol(null);
      } finally {
        if (active) setBalanceLoading(false);
      }
    };

    loadBalance();
    return () => {
      active = false;
    };
  }, [open, session?.user]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      const target = event.target as Node;
      if (!menuRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (status === "loading") {
    return <div className="h-8 w-8 rounded-full bg-white/10 animate-pulse" />;
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:border-cyan-200/50 hover:bg-white/20 active:scale-[0.98]"
      >
        Sign in
      </button>
    );
  }

  const { name, email, image } = session.user;
  const walletPubkey = (session.user as any).walletPublicKey as string | null;
  const shortKey = walletPubkey
    ? `${walletPubkey.slice(0, 8)}…${walletPubkey.slice(-4)}`
    : "No wallet";

  const handleModeChange = (nextMode: WalletMode) => {
    setMode(nextMode);
  };

  const handleCopyAddress = async () => {
    if (!walletPubkey) return;
    try {
      await navigator.clipboard.writeText(walletPubkey);
      setAddressCopyStatus("done");
      window.setTimeout(() => setAddressCopyStatus("idle"), 1800);
    } catch {
      setAddressCopyStatus("error");
      window.setTimeout(() => setAddressCopyStatus("idle"), 1800);
    }
  };

  const handleCopyPrivateKey = async () => {
    const confirmed = window.confirm(
      "Copy managed wallet private key to clipboard? Keep it secure and never share it."
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/wallet/private-key", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.privateKey) {
        throw new Error(data?.error || "Failed to fetch private key");
      }
      await navigator.clipboard.writeText(data.privateKey);
      setCopyStatus("done");
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    }
  };

  const handleSignOut = async () => {
    setSignOutLoading(true);
    setOpen(false);
    await signOut({ callbackUrl: "/" });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition duration-200 hover:border-cyan-200/40 hover:bg-white/20 active:scale-[0.985]"
      >
        {image ? (
          <Image src={image} alt={name ?? ""} width={26} height={26} className="rounded-full ring-1 ring-white/20" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(120deg,#2fc9ff,#16f2a1)] text-xs font-bold text-[#032030]">
            {(name ?? email ?? "?")[0].toUpperCase()}
          </span>
        )}
        <span className="hidden sm:block max-w-[120px] truncate">{name ?? email}</span>
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]" />
        <span className={`text-xs text-white/65 transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] space-y-4 rounded-2xl border border-cyan-100/25 bg-[#081627]/95 p-4 shadow-[0_22px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl z-50 animate-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/65">Signed in as</p>
              <p className="max-w-[250px] truncate text-sm font-medium text-white">{email}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/80 transition hover:bg-white/20 active:scale-[0.96]"
            >
              Close
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-white/55">Wallet mode</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/8 p-1.5">
              <button
                onClick={() => handleModeChange("managed")}
                className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition duration-150 active:scale-[0.98] ${
                  mode === "managed"
                    ? "border border-emerald-300/50 bg-emerald-400/18 text-emerald-100"
                    : "border border-transparent text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                Managed
              </button>
              <button
                onClick={() => handleModeChange("adapter")}
                className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition duration-150 active:scale-[0.98] ${
                  mode === "adapter"
                    ? "border border-cyan-300/50 bg-cyan-400/18 text-cyan-100"
                    : "border border-transparent text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                Wallet Adapter
              </button>
            </div>
            {modeWarning && (
              <p className="mt-2 rounded-lg border border-amber-300/35 bg-amber-500/12 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200 animate-in">
                {modeWarning}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-white/50">Managed wallet</p>
            <p className="font-mono text-sm text-cyan-200">{shortKey}</p>
            {walletPubkey && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleCopyAddress}
                  className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 transition hover:bg-white/20 active:scale-[0.98]"
                >
                  Copy public key
                </button>
                {addressCopyStatus === "done" && <span className="text-[11px] text-emerald-200">Public key copied</span>}
                {addressCopyStatus === "error" && <span className="text-[11px] text-rose-200">Failed</span>}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/75">Managed wallet balance</p>
            <p className="text-sm font-semibold text-emerald-200 transition-opacity duration-200">
              {balanceLoading
                ? "Loading wallet balance..."
                : balanceSol === null
                ? "Unavailable"
                : `${balanceSol.toFixed(4)} SOL`}
            </p>
          </div>

          <div className="rounded-xl border border-rose-300/30 bg-rose-500/12 p-2.5">
            <p className="mb-1 text-xs uppercase tracking-[0.12em] text-rose-100/85">Sensitive action</p>
            <button
              onClick={handleCopyPrivateKey}
              className="rounded-md border border-rose-200/25 bg-rose-300/8 px-2 py-1 text-xs font-medium text-rose-100 transition hover:bg-rose-300/16 active:scale-[0.98]"
            >
              Copy private key
            </button>
            {copyStatus === "done" && <p className="mt-1 text-[11px] text-emerald-200">Copied to clipboard</p>}
            {copyStatus === "error" && <p className="mt-1 text-[11px] text-rose-200">Could not copy private key</p>}
          </div>

          <button
            onClick={handleSignOut}
            disabled={signOutLoading}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-white/20 active:scale-[0.985] disabled:opacity-60"
          >
            {signOutLoading ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
