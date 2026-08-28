"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/app/lib/auth-client";
import { BrandMark } from "@/app/lib/BrandMark";
import { Dialog } from "@/app/lib/Dialog";

// The sign-in surface, in one place. It is a dialog (the header button, /mine)
// or a bare button inside a surface that is already a dialog (Publish) — there
// is no sign-in PAGE: `/signin` was retired on 2026-08-28 and 308s to /mine.
//
// Google is the only provider and `signIn.social` is a FULL-PAGE redirect
// regardless, so the dialog is not avoiding a navigation — it is avoiding the
// *round trip back*: the page you were on stays underneath, and `callbackURL`
// returns you to it instead of to a generic landing. Better Auth needs no page
// of ours either: a failed sign-in comes back to `callbackURL` with an `error`
// param, not to a login route.

/** Same-site paths only — never an external URL, and never a protocol-relative
 *  `//evil.com` (which `startsWith("/")` alone would happily accept). */
function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

/** Where to return after Google. The caller's `next` wins (Publish wants
 *  `/editor`); then a `?next=` already on the URL — which is how a stale
 *  `/signin?next=/editor` link still lands in the editor, since the 308 to
 *  /mine carries the query with it; otherwise it is wherever the person already
 *  was, read from `window.location` at CLICK time. `useSearchParams` would opt
 *  every route rendering this into dynamic rendering to answer the same
 *  question. */
function callbackFor(next?: string): string {
  const explicit = safeNext(next);
  if (explicit) return explicit;
  if (typeof window === "undefined") return "/mine";
  const fromQuery = safeNext(
    new URLSearchParams(window.location.search).get("next"),
  );
  if (fromQuery) return fromQuery;
  return window.location.pathname + window.location.search;
}

function GoogleGlyph() {
  return (
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
  );
}

/** The Google button on its own — for surfaces that already ARE a dialog and
 *  must not open a second one (PublishDialog). */
export function GoogleSignInButton({
  next,
  className = "",
}: {
  next?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    // Full-page redirect to Google, then back to callbackURL. On failure we stay
    // put, so surface the error and re-enable the button.
    const res = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackFor(next),
    });
    if (res?.error) {
      toast.error(res.error.message || "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy}
      className={`glow-brand zf-cta-light flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50 ${className}`}
    >
      <GoogleGlyph />
      {busy ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

/** Mark + copy + button — the dialog's body. Kept separate from the dialog shell
 *  so a future surface can host it inline without a modal. */
export function SignInPanel({ next, idKey }: { next?: string; idKey: string }) {
  return (
    <>
      <div className="mb-6 flex flex-col items-center text-center">
        <BrandMark idKey={idKey} className="h-10 w-10" />
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Welcome
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          An account is only needed to{" "}
          <strong className="text-white/70">publish</strong> or save dashboards
          — browsing, preview, and editing stay open.
        </p>
      </div>
      <GoogleSignInButton next={next} />
    </>
  );
}

export function SignInDialog({
  onClose,
  next,
}: {
  onClose: () => void;
  next?: string;
}) {
  return (
    <Dialog onClose={onClose} maxWidth="max-w-sm">
      <SignInPanel next={next} idKey="signin-dialog" />
      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-xl px-3 py-2 text-sm text-white/55 transition-colors hover:text-white/80"
      >
        Not now
      </button>
    </Dialog>
  );
}
