"use client";

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-sm space-y-4 p-8 rounded-2xl border border-white/10 bg-white/5 text-center">
        <div className="text-4xl">📬</div>
        <h1 className="text-xl font-bold text-white">Check your email</h1>
        <p className="text-white/60 text-sm">
          A magic sign-in link has been sent to your email address.
          <br />
          The link expires in 10 minutes.
        </p>
        <p className="text-white/30 text-xs">You can close this tab.</p>
      </div>
    </div>
  );
}
