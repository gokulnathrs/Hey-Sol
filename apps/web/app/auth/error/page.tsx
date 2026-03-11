"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ERRORS: Record<string, string> = {
  Configuration: "There is a problem with the server configuration.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The sign-in link has expired or has already been used.",
  Default: "An unexpected error occurred. Please try again.",
};

export default function AuthErrorPage() {
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const message = ERRORS[error] ?? ERRORS.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-sm space-y-4 p-8 rounded-2xl border border-red-500/30 bg-red-500/5 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-bold text-white">Sign-in error</h1>
        <p className="text-red-400 text-sm">{message}</p>
        <Link
          href="/auth/signin"
          className="inline-block mt-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-semibold text-white transition"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
