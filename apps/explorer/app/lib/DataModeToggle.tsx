"use client";

import { useEffect, useRef, useState } from "react";
import { getDataMode, setDataMode, type DataMode } from "@/app/lib/data-mode";

// Header pill showing which data the site is rendering — "Demo data" (default)
// or "Live data" — with a popover that explains the mode and offers the switch.
// The pill is the labelling half of the demo-by-default posture (data-mode.ts):
// simulated numbers on a public page must be visibly declared as simulated, on
// every surface, all the time — not in a footnote.
//
// Mode resolves in an effect, not at render: the server always renders "demo",
// so reading localStorage during render would hydration-mismatch on opted-in
// browsers. Until mount the pill renders as "Demo data" (matching SSR); the
// popover stays closed until the real mode is known.
export function DataModeToggle() {
  const [mode, setMode] = useState<DataMode | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(getDataMode());
  }, []);

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

  const live = mode === "live";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
          live
            ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300/90 hover:bg-emerald-400/[0.1]"
            : "border-amber-400/20 bg-amber-400/[0.06] text-amber-300/90 hover:bg-amber-400/[0.1]"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            live ? "animate-pulse bg-emerald-400" : "bg-amber-400"
          }`}
        />
        {live ? "Live data" : "Demo data"}
      </button>

      {open && mode !== null && (
        <div
          role="dialog"
          aria-label="Data mode"
          className="glass absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-[#0d0b16]/90 p-4 text-sm shadow-2xl"
        >
          {live ? (
            <>
              <p className="font-medium text-white">Live data</p>
              <p className="mt-1.5 leading-relaxed text-white/55">
                Your browser is fetching real market data directly from free
                public APIs. Nothing goes through our servers beyond a
                same-origin relay for CORS-blocked official sources.
              </p>
              <button
                type="button"
                onClick={() => setDataMode("demo")}
                className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Switch to demo data
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-white">Demo data</p>
              <p className="mt-1.5 leading-relaxed text-white/55">
                Every frame is rendering simulated, deterministic demo data —
                nothing is fetched from external market APIs. Prices and figures
                are illustrative, not real quotes.
              </p>
              <button
                type="button"
                onClick={() => setDataMode("live")}
                className="mt-3 w-full rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-2 text-emerald-300 transition-colors hover:bg-emerald-400/[0.14]"
              >
                Switch to live data
              </button>
              <p className="mt-2 text-xs leading-relaxed text-white/35">
                Live mode makes your browser fetch from free public market APIs
                (Hyperliquid, CoinGecko, and others) on your behalf.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
