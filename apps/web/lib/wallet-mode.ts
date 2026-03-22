"use client";

import { useCallback, useEffect, useState } from "react";

export type WalletMode = "managed" | "adapter";

export const WALLET_MODE_STORAGE_KEY = "hey-sol:wallet-mode";
export const walletModeEventName = "hey-sol:wallet-mode-changed";

export function resolveDefaultWalletMode(): WalletMode {
  if (typeof window === "undefined") return "managed";
  const saved = window.localStorage.getItem(WALLET_MODE_STORAGE_KEY);
  return saved === "adapter" ? "adapter" : "managed";
}

export function setGlobalWalletMode(mode: WalletMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WALLET_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent<WalletMode>(walletModeEventName, { detail: mode }));
}

export function useWalletMode() {
  const [mode, setMode] = useState<WalletMode>("managed");

  useEffect(() => {
    setMode(resolveDefaultWalletMode());

    const onStorage = (event: StorageEvent) => {
      if (event.key === WALLET_MODE_STORAGE_KEY) {
        setMode(resolveDefaultWalletMode());
      }
    };

    const onModeChanged = (event: Event) => {
      const custom = event as CustomEvent<WalletMode>;
      setMode(custom.detail ?? resolveDefaultWalletMode());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(walletModeEventName, onModeChanged as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(walletModeEventName, onModeChanged as EventListener);
    };
  }, []);

  const updateMode = useCallback((next: WalletMode) => {
    setGlobalWalletMode(next);
    setMode(next);
  }, []);

  return { mode, setMode: updateMode };
}
