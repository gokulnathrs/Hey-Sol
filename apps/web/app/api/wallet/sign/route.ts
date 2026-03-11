/**
 * POST /api/wallet/sign — sign a transaction with the user's managed private key
 *
 * Body: { transaction: "<base64-serialized-tx>" }
 * Returns: { signedTransaction: "<base64-serialized-signed-tx>" }
 *
 * This endpoint is only callable from the web app (same-origin session).
 * Channel bots never call it directly — they trigger a confirmation flow first.
 */
import { auth } from "@/auth";
import { signTransactionForUser } from "@/lib/wallet-service";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  transaction: z.string().min(1),
  /** Optional metadata for the audit log */
  meta: z
    .object({
      action: z.string().optional(),
      amountLamports: z.number().optional(),
      recipient: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const { transaction, meta } = parsed.data;
  const userId = session.user.id;

  // Find wallet record for audit log
  const wallet = await prisma.managedWallet.findUnique({ where: { userId } });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  // Write audit log entry (pending)
  const auditLog = await prisma.txAuditLog.create({
    data: {
      userId,
      walletId: wallet.id,
      action: meta?.action ?? "sign_transaction",
      amountLamports: meta?.amountLamports ? BigInt(meta.amountLamports) : null,
      recipient: meta?.recipient ?? null,
      status: "pending",
      metadata: meta ?? {},
    },
  });

  try {
    const signedTransaction = await signTransactionForUser(userId, transaction);

    // Update audit log to signed
    await prisma.txAuditLog.update({
      where: { id: auditLog.id },
      data: { status: "signed" },
    });

    return NextResponse.json({ signedTransaction });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await prisma.txAuditLog.update({
      where: { id: auditLog.id },
      data: { status: "failed", metadata: { error: message } },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
