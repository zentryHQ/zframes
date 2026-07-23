"use client";

import { useState } from "react";
import { toast } from "sonner";

// The real entry point (per the README): install the skill into your agent.
// A copyable command chip — small client island dropped into the server hero.
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(command);
        setCopied(true);
        toast.success("Command copied");
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="hairline zf-press group flex items-center gap-3 rounded-xl bg-black/30 px-4 py-2.5 font-mono text-sm text-white/80 transition-colors hover:bg-black/50"
      aria-label="Copy install command"
    >
      <span className="select-none text-indigo-300/70">$</span>
      <span className="text-white/85">{command}</span>
      <span className="ml-1 text-white/40 transition-colors group-hover:text-white/70">
        {copied ? (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="#3fd08f"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </span>
    </button>
  );
}
