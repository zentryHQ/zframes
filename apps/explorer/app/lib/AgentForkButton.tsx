"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/app/lib/Dialog";
import { Button } from "@/app/components/ui/button";

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
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Fork with your AI ↗
      </Button>

      {open && (
        <Dialog onClose={() => setOpen(false)}>
          <h2 className="text-lg font-semibold text-white">
            Fork with your AI agent
          </h2>
          <p className="mt-1 mb-4 text-sm text-white/55">
            Works with any agent. Paste this — it installs the zframes skill,
            pulls this dashboard onto your machine, serves it live, and helps
            you personalize it.
          </p>
          <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {prompt}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="accent"
              onClick={() => {
                navigator.clipboard?.writeText(prompt);
                setCopied(true);
                toast.success("Fork prompt copied — paste it into your agent");
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy prompt"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
