"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/app/lib/auth-client";
import { BrandMark } from "@/app/lib/BrandMark";

export default function SignInPage() {
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setBusy(true);
    // Return to the gated action that sent the user here (?next=/tinker from
    // Publish, ?next=/mine, …). Same-site paths only — never an external URL.
    const next = new URLSearchParams(window.location.search).get("next");
    const callbackURL =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/mine";
    // Full-page redirect to Google, then back to callbackURL. On failure we
    // land back here, so surface the error and re-enable the button.
    const res = await authClient.signIn.social({
      provider: "google",
      callbackURL,
    });
    if (res?.error) {
      toast.error(res.error.message || "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-6 py-16">
      <div className="zf-surface p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark idKey="signin" className="h-10 w-10" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Welcome
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            An account is only needed to{" "}
            <strong className="text-white/70">publish</strong> or save
            dashboards — browsing, preview, and tinker stay open.
          </p>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="glow-brand zf-cta-light flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          {busy ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>

      <p className="mt-4 text-center text-sm">
        <Link
          href="/"
          className="text-white/55 transition-colors hover:text-white/70"
        >
          ← Back to gallery
        </Link>
      </p>
    </main>
  );
}
