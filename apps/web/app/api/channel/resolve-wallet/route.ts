/**
 * POST /api/channel/resolve-wallet
 *
 * Called by api-node to look up the managed wallet public key for a
 * (channelId, senderId) pair.  Protected by INTERNAL_API_KEY.
 *
 * Body: { channelId: string; senderId: string }
 * Returns: { publicKey: string | null; userId: string | null }
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserIdForChannelSender, getWalletForUser } from "@/lib/wallet-service";

function isAuthorized(req: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return true; // Not configured → open in dev
  const header = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  return header === key;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.channelId || !body?.senderId) {
    return NextResponse.json({ error: "channelId and senderId are required" }, { status: 400 });
  }

  const userId = await getUserIdForChannelSender(body.channelId, body.senderId);
  if (!userId) {
    return NextResponse.json({ publicKey: null, userId: null });
  }

  const wallet = await getWalletForUser(userId);
  return NextResponse.json({ publicKey: wallet?.publicKey ?? null, userId });
}
