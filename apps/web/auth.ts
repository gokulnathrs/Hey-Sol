/**
 * NextAuth v5 configuration — Google OAuth + Email magic link
 *
 * Place AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * EMAIL_SERVER_*, EMAIL_FROM, and DATABASE_URL in apps/web/.env.local
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { createManagedWallet } from "@/lib/wallet-service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Resend({
      from: process.env.EMAIL_FROM ?? "noreply@hey-sol.app",
    }),
  ],

  callbacks: {
    /**
     * Expose user.id and wallet.publicKey in the session so the frontend
     * can use them without extra API calls.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, user }: { session: any; user: any }) {
      if (session.user) {
        session.user.id = user.id;

        // Attach the user's managed wallet public key to the session
        const wallet = await prisma.managedWallet.findUnique({
          where: { userId: user.id },
          select: { publicKey: true },
        });
        session.user.walletPublicKey = wallet?.publicKey ?? null;
      }
      return session;
    },
  },

  events: {
    /**
     * Auto-create a managed wallet the first time a new user signs in.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async createUser({ user }: { user: any }) {
      if (!user.id) return;
      try {
        await createManagedWallet(user.id);
        console.log(`[Auth] Created managed wallet for user ${user.id}`);
      } catch (err) {
        console.error(`[Auth] Failed to create wallet for user ${user.id}:`, err);
      }
    },
  },

  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify-request",
    error: "/auth/error",
  },
});
