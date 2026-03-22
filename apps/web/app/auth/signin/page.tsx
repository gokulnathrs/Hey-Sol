/**
 * Sign-in page — Google OAuth + Email magic link
 */
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setEmailLoading(true);
    setError(null);
    try {
      const result = await signIn("resend", { email, redirect: false });
      if (result?.error) {
        setError("Could not send magic link. Please try again.");
        return;
      }
      setEmailSent(true);
    } catch {
      setError("Could not send magic link. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden px-6 py-10"
      style={{
        background:
          "radial-gradient(circle at 18% 18%, rgba(20,241,149,0.18), transparent 35%), radial-gradient(circle at 82% 20%, rgba(255,140,66,0.2), transparent 36%), radial-gradient(circle at 50% 120%, rgba(0,170,255,0.2), transparent 44%), #07121e",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      <div className="relative mx-auto flex min-h-[80vh] w-full max-w-5xl items-center justify-center">
        <section className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/20 bg-[#0b1727]/85 p-8 text-white shadow-[0_22px_80px_rgba(0,0,0,0.46)] backdrop-blur-2xl sm:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-52 w-52 rounded-full bg-[#16f2a1]/18 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-24 h-64 w-64 rounded-full bg-[#00a2ff]/14 blur-3xl" />

          <div className="relative text-center">
            <p className="mb-3 inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/75">
              Secure Access
            </p>
            <h1 className="font-darker-grotesque text-5xl font-extrabold leading-[0.95] sm:text-6xl">
              Welcome to HeySOL
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-200/75">
              Sign in to launch your chat-driven Solana workspace with managed wallet support.
            </p>
          </div>

          <div className="relative mt-7 space-y-5">
            {error && (
              <div className="rounded-xl border border-rose-300/40 bg-rose-600/20 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            )}

            {emailSent ? (
              <div className="space-y-2 rounded-2xl border border-emerald-300/35 bg-emerald-500/15 p-5 text-center">
                <p className="text-base font-semibold text-emerald-200">Magic link sent</p>
                <p className="text-sm text-emerald-100/90">
                  Check <span className="font-medium text-white">{email}</span> and use the link to finish sign-in.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEmail("");
                    setEmailSent(false);
                  }}
                  className="mt-2 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:bg-white/20 active:scale-[0.98]"
                >
                  Use another email
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || emailLoading}
                  className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_34px_rgba(255,255,255,0.22)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon />
                  {googleLoading ? "Redirecting..." : "Continue with Google"}
                </button>

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/20" />
                  <span className="text-xs uppercase tracking-[0.2em] text-white/50">or</span>
                  <span className="h-px flex-1 bg-white/20" />
                </div>

                <form onSubmit={handleEmailSignIn} className="space-y-3">
                  <label className="block text-xs uppercase tracking-[0.18em] text-white/55">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-300/55 outline-none transition duration-150 focus:border-[#16f2a1]/70 focus:ring-4 focus:ring-[#16f2a1]/25"
                  />
                  <button
                    type="submit"
                    disabled={emailLoading || googleLoading}
                    className="w-full rounded-2xl bg-[linear-gradient(110deg,#16f2a1,#2ad2ff)] px-4 py-3 text-sm font-bold text-[#05121f] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(22,242,161,0.38)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {emailLoading ? "Sending magic link..." : "Send magic link"}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="relative mt-6 text-center text-xs text-slate-300/70">
            By signing in, a managed Solana wallet is created and secured for you.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
