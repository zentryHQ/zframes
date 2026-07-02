"use client";

import { useState } from "react";
import { Dialog } from "@/app/lib/Dialog";

// Agent-agnostic "take it home" fork: copy a prompt into ANY AI agent (Claude
// Code, Codex, Cursor, Aider…). The agent ensures the zframes skill is installed
// (`npx skills add zentryhq/zframes`) then fetches this dashboard's spec, serves
// it locally, and personalizes it. No CLI-specific magic, no account needed.
export function AgentForkButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const prompt = `Fork this zframes dashboard and help me personalize it:
  npx skills add zentryhq/zframes
  ${origin}/d/${id}/dashboard.json`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="zf-press rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white"
      >
        Fork with your AI ↗
      </button>

      {open && (
        <Dialog onClose={() => setOpen(false)}>
          <h2 className="text-lg font-semibold text-white">Fork with your AI agent</h2>
          <p className="mt-1 mb-4 text-sm text-white/55">
            Works with any agent. Paste this — it installs the zframes skill,
            pulls this dashboard onto your machine, serves it live, and helps you
            personalize it.
          </p>
          <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {prompt}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(prompt);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="zf-press rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
            >
              {copied ? "Copied" : "Copy prompt"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-white/50 transition-colors hover:text-white/75"
            >
              Close
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
