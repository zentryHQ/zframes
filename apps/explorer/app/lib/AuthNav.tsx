"use client";

import Link from "next/link";
import { authClient } from "@/app/lib/auth-client";

// Header auth widget — rendered inside the (server) layout nav.
//
// Deliberately NO persistent "Sign in" CTA: an account is the price of writing
// (publish, My dashboards), never of using the product, so the prompt surfaces
// in-context at those gated moments (PublishDialog, /mine) instead of nagging
// from the chrome. Logged-out (and while the session resolves) this renders
// nothing — the layout's GitHub link keeps the header's right slot occupied.
export function AuthNav() {
  const { data, isPending } = authClient.useSession();

  if (isPending || !data?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <Link href="/mine" className="text-white/60 transition-colors hover:text-white">
        My dashboards
      </Link>
      <span className="hidden text-xs text-white/55 sm:inline">{data.user.email}</span>
      <button
        type="button"
        onClick={() => authClient.signOut().then(() => window.location.reload())}
        className="text-white/55 transition-colors hover:text-white/80"
      >
        Sign out
      </button>
    </div>
  );
}
