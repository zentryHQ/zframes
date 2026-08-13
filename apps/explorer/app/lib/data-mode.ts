"use client";

// The explorer's data-mode switch: "demo" (default) renders every frame from the
// deterministic offline MockMarketDataProvider; "live" opts in to the real
// keyless provider set, fetched by the VISITOR'S browser.
//
// Demo-by-default is a compliance posture, not a performance one: several
// upstream sources' terms prohibit a company republishing their data on a hosted
// site, so the public pages ship simulated data and the visitor explicitly opts
// in to fetching the real thing themselves (docs/decisions/web-explorer/). That
// is also why the flag lives in localStorage and never in a cookie or the DB —
// the choice belongs to this browser, and the server never fetches on its
// behalf either way.
//
// Kept free of provider imports on purpose: the header toggle mounts in the root
// layout, and importing `frames.ts` here would pull the whole provider + frame
// registry graph into every page's client bundle.

export type DataMode = "demo" | "live";

export const DATA_MODE_KEY = "zframes-data-mode";

/**
 * Resolve the current mode. Anywhere storage is unreadable — SSR, a partitioned
 * third-party iframe, privacy modes — the answer is "demo": the safe default is
 * the one that fetches nothing.
 */
export function getDataMode(): DataMode {
  if (typeof window === "undefined") return "demo";
  try {
    return window.localStorage.getItem(DATA_MODE_KEY) === "live"
      ? "live"
      : "demo";
  } catch {
    return "demo";
  }
}

/**
 * Persist the choice and reload. A reload rather than live re-plumbing is
 * deliberate: the provider set is a module-scope singleton shared by every
 * mounted frame (one Hyperliquid socket, one TtlCache per source), so swapping
 * it in place would mean tearing down and re-threading provider context under
 * live components. A one-time navigation on an explicit user action is simpler
 * and provably leak-free.
 */
export function setDataMode(mode: DataMode): void {
  try {
    window.localStorage.setItem(DATA_MODE_KEY, mode);
  } catch {
    // Storage blocked → the reload below lands back in demo mode, which is
    // the correct failure direction.
  }
  window.location.reload();
}
