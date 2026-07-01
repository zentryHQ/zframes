"use client";

import Link from "next/link";
import { authClient } from "@/app/lib/auth-client";

// Header auth widget — rendered inside the (server) layout nav.
export function AuthNav() {
  const { data, isPending } = authClient.useSession();

  if (isPending) return <span className="text-xs text-white/25">…</span>;

  if (!data?.user) {
    return (
      <Link
        href="/signin"
        className="rounded-lg border border-white/15 px-3 py-1 text-white/80 transition-colors hover:border-white/30 hover:text-white"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/mine" className="text-white/60 transition-colors hover:text-white">
        My dashboards
      </Link>
      <span className="hidden text-xs text-white/35 sm:inline">{data.user.email}</span>
      <button
        type="button"
        onClick={() => authClient.signOut().then(() => window.location.reload())}
        className="text-white/40 transition-colors hover:text-white/80"
      >
        Sign out
      </button>
    </div>
  );
}
