/**
 * Mode utilities for mainnet/devnet switching
 */
export function getNetworkMode() {
    const mode = (process.env.MODE || "devnet").toLowerCase();
    return mode === "mainnet" ? "mainnet" : "devnet";
}
export function isMainnet() {
    return getNetworkMode() === "mainnet";
}
export function isDevnet() {
    return getNetworkMode() === "devnet";
}
export function logMode(context = "") {
    const mode = getNetworkMode();
    console.log(`[${context || "MODE"}] Running in ${mode.toUpperCase()} mode`);
}
