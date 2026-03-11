"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import { useState } from "react";

/**
 * Shows the signed-in user's avatar + wallet public key (truncated),
 * or a "Sign in" button when unauthenticated.
 */
export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  if (status === "loading") {
    return <div className="h-8 w-8 rounded-full bg-white/10 animate-pulse" />;
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="rounded-xl border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 transition"
      >
        Sign in
      </button>
    );
  }

  const { name, email, image } = session.user;
  const walletPubkey = (session.user as any).walletPublicKey as string | null;
  const shortKey = walletPubkey
    ? `${walletPubkey.slice(0, 4)}…${walletPubkey.slice(-4)}`
    : "No wallet";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 transition"
      >
        {image ? (
          <Image src={image} alt={name ?? ""} width={24} height={24} className="rounded-full" />
        ) : (
          <span className="h-6 w-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">
            {(name ?? email ?? "?")[0].toUpperCase()}
          </span>
        )}
        <span className="hidden sm:block max-w-[120px] truncate">{name ?? email}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border border-white/10 bg-[#1a1a2e] p-3 shadow-xl z-50 space-y-3">
          <div>
            <p className="text-xs text-white/40">Signed in as</p>
            <p className="text-sm text-white truncate">{email}</p>
          </div>
          <div>
            <p className="text-xs text-white/40">Managed wallet</p>
            <p className="text-sm font-mono text-violet-300">{shortKey}</p>
            {walletPubkey && (
              <button
                onClick={() => navigator.clipboard.writeText(walletPubkey)}
                className="mt-1 text-xs text-white/40 hover:text-white/70 transition"
              >
                Copy full address
              </button>
            )}
          </div>
          <button
            onClick={() => { setOpen(false); signOut({ callbackUrl: "/" }); }}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-red-400 hover:bg-white/10 transition"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
