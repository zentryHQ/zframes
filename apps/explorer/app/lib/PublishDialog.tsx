"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { DashboardSpec } from "@zframes/core";
import { authClient } from "@/app/lib/auth-client";
import { Dialog } from "@/app/lib/Dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

// `multiline` values wrap and show in full; short ones stay a single truncated
// line. Both need `min-w-0` on the <code> and `shrink-0` on the button: a flex
// item's automatic minimum size is its min-content width, so a nowrap value
// becomes the row's minimum, the row becomes the dialog panel's minimum, and the
// panel overflows the dialog sideways — taking the copy button with it.
function CopyRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs uppercase tracking-wide text-white/55">
        {label}
      </div>
      <div
        className={`flex gap-2 ${multiline ? "items-start" : "items-center"}`}
      >
        <code
          className={`min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 ${
            multiline
              ? "leading-relaxed break-words whitespace-pre-wrap"
              : "truncate"
          }`}
        >
          {value}
        </code>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 text-xs"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            toast.success(`${label} copied`);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string } | null>(null);

  async function publish() {
    setBusy(true);
    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        spec: getSpec(),
        // Publishing ALWAYS lists. There was a "list in the gallery" checkbox
        // here, unticked by default, so the obvious path — hit Publish, hit
        // Publish — minted a link-only board and the author then had to find
        // /mine and click "List" to get the thing they thought they had already
        // done. Publishing IS the act of sharing. Unlisting stays possible, but
        // as an after-the-fact choice on /mine, not a gate on the happy path.
        visibility: "listed",
        tags: [],
      }),
    });
    setBusy(false);
    if (res.status === 401) {
      toast.error("Your session expired — sign in again to publish.");
      return;
    }
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b.error || "Publish failed");
      return;
    }
    setResult(await res.json());
    toast.success("Dashboard published");
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = result ? `${origin}/dashboard/${result.id}` : "";
  const forkPrompt = result
    ? `Fork this zframes dashboard and help me personalize it:\n  npx skills add zentryhq/zframes\n  ${shareUrl}/dashboard.json`
    : "";

  return (
    <Dialog onClose={onClose}>
      <>
        {!data?.user ? (
          <>
            <h2 className="text-lg font-semibold text-white">
              Sign in to publish
            </h2>
            <p className="mt-2 text-sm text-white/55">
              Publishing needs an account (browsing and editing don't). Your
              edits stay saved in this browser meanwhile.
            </p>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="accent" size="sm">
                <Link href="/signin?next=/editor">Sign in</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        ) : result ? (
          <>
            <h2 className="text-lg font-semibold text-white">Published 🎉</h2>
            <p className="mt-1 mb-4 text-sm text-white/55">
              Listed in the board gallery. Immutable snapshot — anyone can view
              it live or fork it.
            </p>
            <div className="space-y-4">
              <CopyRow label="Share link" value={shareUrl} />
              <CopyRow
                label="Fork with any AI agent"
                value={forkPrompt}
                multiline
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/${result.id}`}>Open preview</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white">
              Publish dashboard
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-white/55">
                  Title
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <p className="text-sm text-white/55">
                Published boards appear in the{" "}
                <Link href="/boards" className="text-white/80 underline">
                  board gallery
                </Link>{" "}
                right away. You can unlist one later from your boards.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="accent" onClick={publish} disabled={busy}>
                {busy ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </>
        )}
      </>
    </Dialog>
  );
}
