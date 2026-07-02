"use client";

import { useState } from "react";

// Subtle "report" affordance on a preview. Anyone can report (auth optional);
// publish-then-report — it queues the dashboard for admin review, hides nothing.
export function ReportButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch(`/api/dashboards/${id}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => {});
    setBusy(false);
    setDone(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-white/45 transition-colors hover:text-white/60"
      >
        Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="zf-surface w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <>
                <h2 className="text-lg font-semibold text-white">Thanks — reported</h2>
                <p className="mt-1 text-sm text-white/55">
                  We'll review this dashboard.
                </p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-white/60">
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white">Report dashboard</h2>
                <p className="mt-1 mb-3 text-sm text-white/55">
                  What's wrong with it? (optional)
                </p>
                <textarea
                  className="h-24 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white"
                  placeholder="e.g. spam, misleading, sketchy link…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-white/50">
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 disabled:opacity-50"
                  >
                    {busy ? "…" : "Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
