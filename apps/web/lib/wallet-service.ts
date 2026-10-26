/**
 * Managed wallet service
 *
 * All private keys are encrypted with AES-256-GCM before storage.
 * The encryption key is WALLET_ENCRYPTION_KEY (32-byte hex string) from env —
 * it is NEVER stored in the database.
 *
 * Encrypted format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { prisma } from "./prisma";
import type { ManagedWallet } from "@prisma/client";

// ---------------------------------------------------------------------------
// Key material
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const hex = process.env.WALLET_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "WALLET_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes). " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt helpers
// ---------------------------------------------------------------------------

function encryptPrivateKey(privateKeyBs58: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(privateKeyBs58, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptPrivateKey(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted private key format");
  const [ivHex, authTagHex, ciphertextHex] = parts;

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Wallet CRUD
// ---------------------------------------------------------------------------

/**
 * Generate a fresh Solana keypair, encrypt the private key, and persist it.
 * Idempotent — returns existing wallet if one already exists for the user.
 */
export async function createManagedWallet(userId: string): Promise<ManagedWallet> {
  const existing = await prisma.managedWallet.findUnique({ where: { userId } });
  if (existing) return existing;

  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKeyBs58 = bs58.encode(keypair.secretKey);
  const encryptedPrivateKey = encryptPrivateKey(privateKeyBs58);

  return prisma.managedWallet.create({
    data: { userId, publicKey, encryptedPrivateKey },
  });
}

/**
 * Retrieve the managed wallet record for a user (public key only — safe).
 */
export async function getWalletForUser(userId: string): Promise<ManagedWallet | null> {
  return prisma.managedWallet.findUnique({ where: { userId } });
}

/**
 * Retrieve the decrypted private key (base58) for a user's managed wallet.
 * Intended for explicit, user-initiated export flows.
 */
export async function getDecryptedPrivateKeyForUser(userId: string): Promise<string> {
  const wallet = await prisma.managedWallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error(`No managed wallet found for user ${userId}`);
  return decryptPrivateKey(wallet.encryptedPrivateKey);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Channel identity linking
// ---------------------------------------------------------------------------

/**
 * Find the user ID associated with a (channelId, senderId) pair, if any.
 */
export async function getUserIdForChannelSender(
  channelId: string,
  senderId: string
): Promise<string | null> {
  const record = await prisma.channelAccount.findUnique({
    where: { channelId_senderId: { channelId, senderId } },
    select: { userId: true },
  });
  return record?.userId ?? null;
}

/**
 * Link a channel sender identity to an existing user account.
 * Safe to call multiple times — upserts.
 */
export async function linkChannelAccount(
  userId: string,
  channelId: string,
  senderId: string,
  label?: string
): Promise<void> {
  await prisma.channelAccount.upsert({
    where: { channelId_senderId: { channelId, senderId } },
    update: { label },
    create: { userId, channelId, senderId, label },
  });
}
