/**
 * GET /api/wallet — returns the current user's managed wallet public key
 */
import { auth } from "@/auth";
import { getWalletForUser } from "@/lib/wallet-service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await getWalletForUser(session.user.id);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ publicKey: wallet.publicKey });
}
