import { useSyncExternalStore } from "react";

// The device / preference gates hosts use to skip the full-screen WebGL
// backdrop — a purely-cosmetic GPU + bandwidth tax a weak or metered device
// can't spare. Both hooks are SSR-safe (`useSyncExternalStore` with a false
// server snapshot, so server markup and the hydration render always match)
// and reactive to their media-query signals (a user can flip reduced-data /
// reduced-motion mid-session; the navigator signals are fixed per session).

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const REDUCED_DATA = "(prefers-reduced-data: reduce)";
const SMALL_TOUCH = "(pointer: coarse) and (max-width: 768px)";

interface CapabilityNavigator extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

// Deliberately trips only on clear signals; capable phones/tablets keep the
// scene:
//   - explicit user/OS intent: prefers-reduced-data, or the Save-Data header
//   - weak hardware: <=4 GB deviceMemory or <=4 logical cores (both optional —
//     a missing value counts as high-end, so Firefox/Safari never downgrade on
//     hardware alone)
//   - a small touch screen (coarse pointer AND <=768px) — a phone, not an iPad
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

function subscribeToQueries(
  queries: readonly string[],
  onChange: () => void,
): () => void {
  const lists = queries.map((q) => window.matchMedia(q));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

const serverSnapshot = () => false;

const subscribeLowEnd = (onChange: () => void) =>
  subscribeToQueries([REDUCED_DATA, SMALL_TOUCH], onChange);

/**
 * True when the device is likely too weak or too metered to spend GPU +
 * bandwidth on the WebGL backdrop, so the host can downgrade it to its static
 * fallback. Seeds synchronously in a plain SPA render (no flash of scene on a
 * low-end device) and defers to a post-hydration re-check under SSR.
 */
export function useLowEndDevice(): boolean {
  return useSyncExternalStore(subscribeLowEnd, detectLowEnd, serverSnapshot);
}

const detectReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches;

const subscribeReducedMotion = (onChange: () => void) =>
  subscribeToQueries([REDUCED_MOTION], onChange);

/**
 * True under `prefers-reduced-motion: reduce`. A perpetual WebGL loop IS
 * motion — hosts that treat the backdrop as skippable decoration (the
 * explorer) gate on this too; the runtime instead keeps the scene and lets
 * its motion-adding extras self-disable.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    detectReducedMotion,
    serverSnapshot,
  );
}
