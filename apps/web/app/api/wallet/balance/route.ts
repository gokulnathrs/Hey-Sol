import { auth } from "@/auth";
import { getWalletForUser } from "@/lib/wallet-service";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

/**
 * GET /api/wallet/balance - returns SOL balance for the current user's managed wallet.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await getWalletForUser(session.user.id);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  try {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const lamports = await connection.getBalance(new PublicKey(wallet.publicKey), "confirmed");

    return NextResponse.json({
      publicKey: wallet.publicKey,
      lamports,
      sol: lamports / 1_000_000_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
