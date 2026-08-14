"use client";

import { useEffect, useRef, useState } from "react";

// Header pill declaring that the site renders demo data — with a popover that
// explains what that means. The pill is the labelling half of the mock-only
// posture (frames.ts): simulated numbers on a public page must be visibly
// declared as simulated, on every surface, all the time — not in a footnote.
// There is no live mode and no switch; the explorer never fetches from any
// upstream market API.
export function DemoDataBadge() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while the popover is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-xs text-amber-300/90 transition-colors hover:bg-amber-400/[0.1]"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Demo data
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Demo data"
          className="glass absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-[#0d0b16]/90 p-4 text-sm shadow-2xl"
        >
          <p className="font-medium text-white">Demo data</p>
          <p className="mt-1.5 leading-relaxed text-white/55">
            Every frame is rendering simulated, deterministic demo data —
            nothing is fetched from external market APIs. Prices and figures are
            illustrative, not real quotes. Run the zframes CLI to see your
            boards on live data.
          </p>
        </div>
      )}
    </div>
  );
}
