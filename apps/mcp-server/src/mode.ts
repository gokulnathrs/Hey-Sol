/**
 * Mode utilities for mainnet/devnet switching
 */

export type NetworkMode = "mainnet" | "devnet";

export function getNetworkMode(): NetworkMode {
  const mode = (process.env.MODE || "devnet").toLowerCase();
  return mode === "mainnet" ? "mainnet" : "devnet";
}

export function isMainnet(): boolean {
  return getNetworkMode() === "mainnet";
}

export function isDevnet(): boolean {
  return getNetworkMode() === "devnet";
}

export function logMode(context: string = ""): void {
  const mode = getNetworkMode();
  console.log(`[${context || "MODE"}] Running in ${mode.toUpperCase()} mode`);
}
