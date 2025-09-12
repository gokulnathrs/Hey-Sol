
import { z } from "zod";
import * as dotenv from "dotenv";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Address, appendTransactionMessageInstruction, compileTransactionMessage, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, generateKeyPairSigner, getSignatureFromTransaction, lamports, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners, TransactionSigner } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { string } from "zod/v4";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import { fetchAssetsByOwner } from "@metaplex-foundation/mpl-core";
import { fetchMetadata } from "./helper/index.js";

dotenv.config();

// Validate required environment variables
function validateEnvironment() {
  const requiredEnvVars = {
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
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

async function send_sol(amount: string, address: string){
  try {
    const rpcUrl = process.env.RPC_URL;
    const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.WS_RPC_URL as string);
    const rpc = createSolanaRpc(rpcUrl as string)

    const privateKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY as string)
    
    const recepient = address as Address<string> ;
    const user = await createKeyPairSignerFromBytes(new Uint8Array(privateKey))

    const { value: latestBlockHash } = await rpc.getLatestBlockhash().send();

    const lamportAmount = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

    const transactionMessage = pipe(
      createTransactionMessage({ version: 0}),
      tx => setTransactionMessageFeePayer(user.address, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash, tx),
      tx => appendTransactionMessageInstruction(
        getTransferSolInstruction({
          amount: lamports(BigInt(lamportAmount)),
          destination: recepient,
          source: user
        }),
        tx
      )
    )

    const signedTxn = await signTransactionMessageWithSigners(transactionMessage)
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

    try {
      await sendAndConfirmTransaction(
        signedTxn,
        {
          commitment: 'confirmed', skipPreflight: true
        }
      )

      const signature = getSignatureFromTransaction(signedTxn)
      console.log('✅ - Transfer transaction:', signature);
      return {
        status: "success",
        signature
      }
    } catch (e) {
        console.error('Transfer failed:', e);
        return {
          status: "failed",
          message: "Transfer failed"
        }
    }

  } catch (error) {
    console.error("Failed==> ",error)
    return {
          status: "failed",
          message: "Send_SOL Function failed"
        }
  }
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
          const rpc = createSolanaRpc(rpcUrl);

          // Get latest blockhash
          const { value: latestBlockHash } = await rpc.getLatestBlockhash().send();

          const lamportAmount = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

          // Build transaction message (unsigned)
          const compiledMessage = new TransactionMessage({
            payerKey: new PublicKey(sender),
            recentBlockhash: latestBlockHash.blockhash,
            instructions: [
              SystemProgram.transfer({
                fromPubkey: new PublicKey(sender),
                toPubkey: new PublicKey(address),
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
                  message: `Prepared transaction for send-sol`,
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

          const nftDetails: any[] = [];
          for (const nft of filtered) {
            const metadata = await fetchMetadata(nft.uri);
            nftDetails.push({
              mint: nft.publicKey.toString(),
              name: nft.name,
              uri: nft.uri,
              image: metadata?.image || null,
              description: metadata?.description || null,
              attributes: metadata?.attributes || [],
            });
          }

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