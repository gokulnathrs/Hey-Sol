import { z } from "zod";
import * as dotenv from "dotenv";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import { fetchAssetsByOwner } from "@metaplex-foundation/mpl-core";
import { fetchMetadata } from "./helper/index.js";
import { PrismaClient } from "@prisma/client";
import { createDecipheriv } from "crypto";
import bs58 from "bs58";

dotenv.config();

function validateEnvironment() {
  const requiredEnvVars = {
    RPC_URL: process.env.RPC_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    WALLET_ENCRYPTION_KEY: process.env.WALLET_ENCRYPTION_KEY,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const safeConcurrency = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (true) {
      const current = next;
      next += 1;
      if (current >= items.length) break;
      results[current] = await worker(items[current]);
    }
  });

  await Promise.all(runners);
  return results;
}

function getMaxSendSol(): number {
  const raw = process.env.MAX_SEND_SOL;
  if (!raw) return 5;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return parsed;
}

const prisma = new PrismaClient();

function getEncryptionKey(): Buffer {
  const hex = process.env.WALLET_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("WALLET_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).");
  }
  return Buffer.from(hex, "hex");
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
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function main() {
  try {
    validateEnvironment();
    const RPC_URL = process.env.RPC_URL as string;

    const mcpServerOptions = {
      name: "hey-sol-mcp-server",
      version: "0.0.1",
    };

    const server = new McpServer(mcpServerOptions);

    server.tool(
      "send_sol",
      "Transfer SOL. For managed wallets, signs and broadcasts directly. For others, returns unsigned tx.",
      {
        amount: z.string().describe("Amount of SOL to send"),
        address: z.string().describe("Recipient wallet address"),
        sender: z.string().describe("Sender wallet public key"),
        dryRun: z.boolean().default(false).describe("If true, return a preview without signing"),
      },
      async ({ amount, address, sender, dryRun }) => {
        try {
          const connection = new Connection(RPC_URL, "confirmed");

          const parsedAmount = Number(amount);
          if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            throw new Error("amount must be a positive number");
          }

          const maxSendSol = getMaxSendSol();
          if (parsedAmount > maxSendSol) {
            throw new Error(`amount exceeds MAX_SEND_SOL (${maxSendSol})`);
          }

          const senderKey = new PublicKey(sender);
          const recipientKey = new PublicKey(address);
          const lamports = Math.floor(parsedAmount * LAMPORTS_PER_SOL);

          if (dryRun) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  type: "send-sol-preview",
                  dryRun: true,
                  from: senderKey.toBase58(),
                  to: recipientKey.toBase58(),
                  amountSol: parsedAmount,
                  lamports,
                  limits: { maxSendSol },
                  message: `Preview: would send ${parsedAmount} SOL from ${senderKey.toBase58()} to ${recipientKey.toBase58()}`,
                }),
              }],
            };
          }

          const { blockhash } = await connection.getLatestBlockhash("confirmed");

          const compiledMessage = new TransactionMessage({
            payerKey: senderKey,
            recentBlockhash: blockhash,
            instructions: [
              SystemProgram.transfer({
                fromPubkey: senderKey,
                toPubkey: recipientKey,
                lamports,
              }),
            ],
          }).compileToV0Message();

          const tx = new VersionedTransaction(compiledMessage);

          const managedWallet = await prisma.managedWallet.findUnique({
            where: { publicKey: senderKey.toBase58() },
          });

          if (managedWallet) {
            const privateKeyBs58 = decryptPrivateKey(managedWallet.encryptedPrivateKey);
            const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBs58));
            tx.sign([keypair]);
            const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
            await connection.confirmTransaction(signature, "confirmed");
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  type: "transaction-success",
                  action: "send-sol",
                  from: senderKey.toBase58(),
                  to: recipientKey.toBase58(),
                  amountSol: parsedAmount,
                  signature,
                  message: `Successfully sent ${parsedAmount} SOL to ${recipientKey.toBase58()}. Signature: ${signature}`,
                }),
              }],
            };
          } else {
            const txMessageBase64 = Buffer.from(tx.serialize()).toString("base64");
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  type: "transaction",
                  action: "send-sol",
                  from: senderKey.toBase58(),
                  to: recipientKey.toBase58(),
                  amountSol: parsedAmount,
                  lamports,
                  txMessageBase64,
                  metadata: { recipient: recipientKey.toBase58(), amount: String(parsedAmount) },
                  message: `Prepared ${parsedAmount} SOL transfer. Please sign the transaction to proceed.`,
                }),
              }],
            };
          }
        } catch (error: any) {
          console.error("Failed to send SOL:", error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                type: "send-sol-error",
                error: error?.message || "Unknown error",
              }),
            }],
          };
        }
      }
    );

    server.tool(
      "get_owned_nfts",
      "Fetch NFTs owned by a wallet (optionally filter by collection mint)",
      {
        owner: z.string().describe("Owner wallet public key"),
        collectionMint: z.string().optional().describe("Optional collection mint to filter NFTs"),
      },
      async ({ owner, collectionMint }) => {
        try {
          const umi = createUmi(RPC_URL);
          const assets = await fetchAssetsByOwner(umi, publicKey(owner));

          let filtered = assets;
          if (collectionMint) {
            filtered = assets.filter(
              (nft) =>
                nft.updateAuthority?.type === "Collection" &&
                nft.updateAuthority?.address === collectionMint
            );
          }

          const nftDetails = await mapWithConcurrency(filtered, async (nft) => {
            const metadata = await fetchMetadata(nft.uri);
            return {
              mint: nft.publicKey.toString(),
              name: nft.name,
              uri: nft.uri,
              image: metadata?.image || null,
              description: metadata?.description || null,
              attributes: metadata?.attributes || [],
            };
          }, 6);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                type: "nft-list",
                owner,
                collectionMint: collectionMint || null,
                nfts: nftDetails,
              }),
            }],
          };
        } catch (err: any) {
          console.error("get_owned_nfts error:", err);
          return {
            content: [{
              type: "text",
              text: `Error fetching NFTs: ${err.message}`,
            }],
          };
        }
      }
    );

    server.tool(
      "get_balance",
      "Returns the SOL balance of a wallet address",
      {
        address: z.string().describe("Wallet public key to check balance"),
      },
      async ({ address }) => {
        try {
          const connection = new Connection(RPC_URL, "confirmed");
          const walletPublicKey = new PublicKey(address);
          const balanceLamports = await connection.getBalance(walletPublicKey, "confirmed");
          const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                type: "balance",
                address,
                balance: balanceSol,
                unit: "SOL",
              }),
            }],
          };
        } catch (error: any) {
          console.error("get_balance error:", error);
          return {
            content: [{
              type: "text",
              text: `Error fetching balance: ${error.message}`,
            }],
          };
        }
      }
    );

    server.tool(
      "get_recent_transactions",
      "Fetch the recent N transactions for a given wallet",
      {
        wallet: z.string().describe("The wallet address to check"),
        limit: z.number().min(1).max(20).default(5).describe("Number of recent transactions to fetch"),
      },
      async ({ wallet, limit }) => {
        try {
          const connection = new Connection(RPC_URL);
          const signatures = await connection.getSignaturesForAddress(new PublicKey(wallet), { limit });
          const txs: any[] = [];
          for (const sigInfo of signatures) {
            const tx = await connection.getTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });
            if (!tx) continue;
            txs.push({
              signature: sigInfo.signature,
              slot: tx.slot,
              blockTime: tx.blockTime,
              description: "Unknown transaction",
              status: sigInfo.confirmationStatus,
            });
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                message: `Fetched ${txs.length} recent transactions`,
                type: "transactions",
                wallet,
                transactions: txs,
              }, null, 2),
            }],
          };
        } catch (err: any) {
          console.error("Failed to fetch transactions:", err);
          return {
            content: [{
              type: "text",
              text: "Error fetching transactions",
            }],
          };
        }
      }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Starting MCP server with stdio transport");
  } catch (error) {
    console.error(
      "Failed to start MCP server:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
