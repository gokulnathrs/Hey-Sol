
import { z } from "zod";
import * as dotenv from "dotenv";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import { fetchAssetsByOwner } from "@metaplex-foundation/mpl-core";
import { fetchMetadata } from "./helper/index.js";

dotenv.config();

// Validate required environment variables
function validateEnvironment() {
  const requiredEnvVars = {
    RPC_URL: process.env.RPC_URL,
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

async function main() {
  try {
    // Validate environment before proceeding
    validateEnvironment();
    const RPC_URL = process.env.RPC_URL as string;

    const mcpServerOptions = {
      name: "hey-sol-mcp-server",
      version: "0.0.1",
    };

    const server = new McpServer(mcpServerOptions);

    server.tool(
      "prepare_send_sol_transaction",
      "Prepares an unsigned transaction to transfer SOL",
      {
        amount: z.string().describe("Amount of SOL to send"),
        address: z.string().describe("Recipient wallet address"),
        sender: z.string().describe("Sender wallet address"),
      },
      async ({ amount, address, sender }) => {
        try {
          const rpcUrl = process.env.RPC_URL as string;
          const connection = new Connection(rpcUrl, "confirmed");

          const parsedAmount = Number(amount);
          if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            throw new Error("amount must be a positive number");
          }

          const senderKey = new PublicKey(sender);
          const recipientKey = new PublicKey(address);

          // Get latest blockhash
          const latestBlockHash = await connection.getLatestBlockhash("confirmed");

          const lamportAmount = Math.floor(parsedAmount * LAMPORTS_PER_SOL);

          // Build transaction message (unsigned)
          const compiledMessage = new TransactionMessage({
            payerKey: senderKey,
            recentBlockhash: latestBlockHash.blockhash,
            instructions: [
              SystemProgram.transfer({
                fromPubkey: senderKey,
                toPubkey: recipientKey,
                lamports: lamportAmount,
              })
            ],
          }).compileToV0Message();

          const unsignedTx = new VersionedTransaction(compiledMessage);
          const serializedMessage = Buffer.from(unsignedTx.serialize()).toString("base64");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: `Sending ${amount} SOL to ${address}, Sign the transaction to proceed.`,
                  type: "transaction",
                  action: "send-sol",
                  txMessageBase64: serializedMessage,
                  metadata: { recipient: address, amount }
                })
              }
            ]
          }
        } catch (error) {
          console.error("Failed to prepare transaction:", error);
          return {
            content: [
              {
                type: "text",
                text: "Error preparing unsigned transaction."
              }
            ]
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
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "nft-list",
                  owner,
                  collectionMint: collectionMint || null,
                  nfts: nftDetails,
                }),
              },
            ],
          };
        } catch (err: any) {
          console.error("❌ get_owned_nfts error:", err);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching NFTs: ${err.message}`,
              },
            ],
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
          const rpcUrl = process.env.RPC_URL as string;
          const connection = new Connection(rpcUrl, "confirmed");
          const publicKey = new PublicKey(address);
          const balanceLamports = await connection.getBalance(publicKey, "confirmed");
          const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "balance",
                  address,
                  balance: balanceSol,
                  unit: "SOL",
                }),
              },
            ],
          };
        } catch (error: any) {
          console.error("❌ get_balance error:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching balance: ${error.message}`,
              },
            ],
          };
        }
      }
    );


    server.tool(
      "get_recent_transactions",
      "Fetch the recent N transactions for a given wallet",
      {
        wallet: z.string().describe("The wallet address to check"),
        limit: z.number().min(1).max(20).default(5).describe("Number of recent transactions to fetch")
      },
      async ({ wallet, limit }) => {
        try {
          const connection = new Connection(process.env.RPC_URL as string);

          // Fetch recent signatures
          const signatures = await connection.getSignaturesForAddress(
            new PublicKey(wallet),
            { limit }
          );

          console.log(`Fetched ${signatures.length} signatures for ${wallet}`);
          console.log(signatures)

          const txs: any[] = [];
          for (const sigInfo of signatures) {
            const tx = await connection.getTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });

            console.log('tx', tx)

            if (!tx) continue;

            let description = "Unknown transaction";

            // Simple decode example: check SOL transfer
            // tx.transaction.message.instructions.forEach((ix) => {
            // try {
            //   if ("parsed" in ix) {
            //     const parsed = (ix as any).parsed;
            //     if (parsed?.type === "transfer") {
            //       description = `${parsed.info.lamports / LAMPORTS_PER_SOL} SOL sent to ${parsed.info.destination}`;
            //     }
            //   }
            // } catch (e) {
            //   // ignore parse errors
            // }
            // });

            txs.push({
              signature: sigInfo.signature,
              slot: tx.slot,
              blockTime: tx.blockTime,
              description,
              status: sigInfo.confirmationStatus,
              sigInfo: sigInfo,
              tx: tx
            });
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: `Fetched ${txs.length} recent transactions`,
                  type: "transactions",
                  wallet,
                  transactions: txs,
                  signatures: signatures
                }, null, 2),
              },
            ],
          };
        } catch (err) {
          console.error("❌ Failed to fetch transactions:", err);
          return {
            content: [
              {
                type: "text",
                text: "Error fetching transactions",
              },
            ],
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