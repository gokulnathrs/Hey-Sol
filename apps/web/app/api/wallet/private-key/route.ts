import { auth } from "@/auth";
import { getDecryptedPrivateKeyForUser } from "@/lib/wallet-service";
import { NextResponse } from "next/server";

/**
 * GET /api/wallet/private-key - returns the caller's managed wallet private key (base58).
 * This route is intentionally explicit and should be called only via user confirmation.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const privateKey = await getDecryptedPrivateKeyForUser(session.user.id);
    return NextResponse.json({ privateKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export private key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
