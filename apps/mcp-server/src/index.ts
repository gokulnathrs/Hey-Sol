
import { z } from "zod";
import * as dotenv from "dotenv";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Address, appendTransactionMessageInstruction, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, generateKeyPairSigner, getSignatureFromTransaction, lamports, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { string } from "zod/v4";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

    const mcpServerOptions = {
      name: "hey-sol-mcp-server",
      version: "0.0.1",
    };

    const server = new McpServer(mcpServerOptions);

    server.tool(
      "send_sol",
      "Transfers Solana(SOL) to a wallet address",
      {
        amount: z.string().describe("Amount of SOL to send"),
        address: z.string().describe("Wallet address to send SOL to")
      },
      async ({ amount , address}) => {
        console.error("SOL amount ", amount);

        const txn = await send_sol(amount,address)

        if(txn.status === "success"){
          return {
            content: [
              {
                type: "text",
                text: `Successfully sent ${amount} SOL to ${address}. Transaction signature: ${txn.signature}`
              }
            ]   
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to send ${amount} SOL to ${address}.`
            }
          ]
        }

      }
    )

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