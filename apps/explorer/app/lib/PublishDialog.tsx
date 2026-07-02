"use client";

import Link from "next/link";
import { useState } from "react";
import type { DashboardSpec } from "@zframes/core";
import { authClient } from "@/app/lib/auth-client";
import { Dialog } from "@/app/lib/Dialog";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-white/55">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function PublishDialog({
  getSpec,
  onClose,
}: {
  getSpec: () => DashboardSpec;
  onClose: () => void;
}) {
  const { data } = authClient.useSession();
  const [title, setTitle] = useState(getSpec().title || "My dashboard");
  const [listed, setListed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string } | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        spec: getSpec(),
        visibility: listed ? "listed" : "unlisted",
        tags: [],
      }),
    });
    setBusy(false);
    if (res.status === 401) {
      setError("Your session expired — sign in again to publish.");
      return;
    }
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "Publish failed");
      return;
    }
    setResult(await res.json());
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = result ? `${origin}/d/${result.id}` : "";
  const forkPrompt = result
    ? `Fork this zframes dashboard and help me personalize it:\n  npx skills add zentryhq/zframes\n  ${shareUrl}/dashboard.json`
    : "";

  return (
    <Dialog onClose={onClose}>
      <>
        {!data?.user ? (
          <>
            <h2 className="text-lg font-semibold text-white">Sign in to publish</h2>
            <p className="mt-2 text-sm text-white/55">
              Publishing needs an account (browsing and tinker don't). Your edits
              stay saved in this browser meanwhile.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/signin?next=/tinker"
                className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-sm text-indigo-100 transition-colors hover:bg-indigo-500/25"
              >
                Sign in
              </Link>
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-white/50 transition-colors hover:text-white/75"
              >
                Cancel
              </button>
            </div>
          </>
        ) : result ? (
          <>
            <h2 className="text-lg font-semibold text-white">Published 🎉</h2>
            <p className="mt-1 mb-4 text-sm text-white/55">
              Immutable snapshot — anyone with the link can view it live or fork it.
            </p>
            <div className="space-y-4">
              <CopyRow label="Share link" value={shareUrl} />
              <CopyRow label="Fork with any AI agent" value={forkPrompt} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Link
                href={`/d/${result.id}`}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white"
              >
                Open preview
              </Link>
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-white/50 transition-colors hover:text-white/75"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white">Publish dashboard</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-white/55">
                  Title
                </label>
                <input
                  className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-400/50 focus:bg-white/[0.05]"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={listed}
                  onChange={(e) => setListed(e.target.checked)}
                />
                List in the community gallery (otherwise unlisted — link-only)
              </label>
              {error && <p className="text-sm text-down">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-white/50 transition-colors hover:text-white/75"
              >
                Cancel
              </button>
              <button
                onClick={publish}
                disabled={busy}
                className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25 disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
            </div>
          </>
        )}
      </>
    </Dialog>
  );
}
