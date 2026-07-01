import { useEffect, useState } from "react";

// True when the device is likely too weak or too metered to spend GPU + bandwidth
// on the heaviest, purely-cosmetic effect — the full-screen WebGL background —
// so the host can downgrade it to the static gradient. Deliberately trips only
// on clear signals; capable phones/tablets keep the scene:
//   - explicit user/OS intent: prefers-reduced-data, or the Save-Data header
//   - weak hardware: <=4 GB deviceMemory or <=4 logical cores (both optional —
//     a missing value counts as high-end, so Firefox/Safari never downgrade on
//     hardware alone)
//   - a small touch screen (coarse pointer AND <=768px) — a phone, not an iPad
// Mirrors use-is-desktop.ts: SPA (no SSR), seeded synchronously to avoid a flash,
// and reactive to the media-query signals (the navigator signals are fixed for
// the session). This is deliberately DISTINCT from useIsDesktop (which is purely
// a width threshold for editor-vs-renderer) — a large low-power laptop is
// "desktop" for editing yet "low-end" for the WebGL backdrop.
const REDUCED_DATA = "(prefers-reduced-data: reduce)";
const SMALL_TOUCH = "(pointer: coarse) and (max-width: 768px)";

interface CapabilityNavigator extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

function detectLowEnd(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as CapabilityNavigator;
  if (nav.connection?.saveData) return true;
  if (window.matchMedia(REDUCED_DATA).matches) return true;
  if ((nav.deviceMemory ?? 8) <= 4) return true;
  if ((nav.hardwareConcurrency ?? 8) <= 4) return true;
  if (window.matchMedia(SMALL_TOUCH).matches) return true;
  return false;
}

export function useLowEndDevice(): boolean {
  const [lowEnd, setLowEnd] = useState(detectLowEnd);
  useEffect(() => {
    const queries = [
      window.matchMedia(REDUCED_DATA),
      window.matchMedia(SMALL_TOUCH),
    ];
    const onChange = () => setLowEnd(detectLowEnd());
    for (const q of queries) q.addEventListener("change", onChange);
    return () => {
      for (const q of queries) q.removeEventListener("change", onChange);
    };
  }, []);
  return lowEnd;
}
