"use client";

/**
 * The browser half of the like cap — **UX only, never enforcement.**
 *
 * Two distinct things live in localStorage here and it is worth keeping them
 * straight, because they have different lifetimes and different jobs:
 *
 *   1. `browserId` — a random id sent with every like. It is what subdivides an
 *      IP's per-item allowance, so a shared office or a carrier-NAT phone gets one
 *      allowance PER BROWSER instead of one for the whole network. Clearing it mints
 *      a fresh allowance; that is a known cost, and the server's per-IP ceiling is
 *      what bounds it (see app/lib/likes.ts).
 *
 *   2. The spent-count mirror — lets the button say "you're out" with no round trip.
 *      The server is the truth; this is a guess that is usually right.
 *
 * The mirror can be wrong in BOTH directions and the UI has to survive each:
 *   • optimistic — cleared storage says 0 spent, the server says 429. Expected.
 *   • pessimistic — a like made in another browser is invisible here.
 * So a full mirror is never a reason to skip the request, only a reason to render
 * the spent state first.
 */

const ID_KEY = "zf.like.bid";
const SPENT_PREFIX = "zf.like.spent.";

/** Mirrors PER_ITEM_DAILY_CAP. Duplicated deliberately — the server owns the real
 *  ceiling, and importing a Node module into client code to share a number would
 *  drag `node:crypto` into the browser bundle. A drift here degrades UX, never
 *  correctness: the request still gets the server's verdict. */
export const CLIENT_ITEM_CAP = 5;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Safari private mode / storage disabled — degrade, never throw.
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* full or blocked: the server still enforces, so losing the mirror is fine */
  }
}

/**
 * Stable per-browser id. `crypto.randomUUID` needs a secure context, which
 * localhost and https both are — the fallback covers anything else rather than
 * throwing on a page that would otherwise work.
 */
/**
 * Drop spent-mirror keys from previous days.
 *
 * The keys are namespaced by UTC day so yesterday's allowance can't gate today's, but
 * that means every (day, kind, id) tuple left a key behind and nothing removed it —
 * unbounded growth against an origin quota this repo has already hit once (the
 * provider caches filled localStorage until `setItem` threw and persistence silently
 * stopped). Runs once per session, on first read.
 */
let swept = false;
function sweepStaleSpendKeys(): void {
  if (swept) return;
  swept = true;
  const today = `${SPENT_PREFIX}${utcDay()}.`;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SPENT_PREFIX) && !key.startsWith(today)) {
        doomed.push(key);
      }
    }
    // Collected first, then removed — removing during the scan reindexes the store
    // and would skip keys.
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to sweep, and the cap is server-side anyway */
  }
}

export function browserId(): string {
  const existing = safeGet(ID_KEY);
  if (existing) return existing;
  const minted =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  safeSet(ID_KEY, minted);
  return minted;
}

/**
 * UTC day — must match the server's `utcDay()`. A local-date key here would make
 * the button and the server disagree about which day it is for anyone not on UTC,
 * so the mirror would clear hours before or after the real allowance resets.
 */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function spentKey(kind: string, id: string): string {
  return `${SPENT_PREFIX}${utcDay()}.${kind}.${id}`;
}

export function spentToday(kind: string, id: string): number {
  sweepStaleSpendKeys();
  const raw = safeGet(spentKey(kind, id));
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function recordSpend(kind: string, id: string): void {
  safeSet(spentKey(kind, id), String(spentToday(kind, id) + 1));
}

/** Cheap UX gate. Never authoritative — see the note at the top of this file. */
export function likelyExhausted(kind: string, id: string): boolean {
  return spentToday(kind, id) >= CLIENT_ITEM_CAP;
}

export type LikeOutcome =
  | { ok: true; total: number; remaining: number }
  | { ok: false; reason: "item-cap" | "ip-cap" | "missing" | "error" };

/** POSTs one like and records the spend locally on success. */
export async function sendLike(
  kind: "dashboard" | "frame",
  id: string,
): Promise<LikeOutcome> {
  try {
    const res = await fetch("/api/likes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, browserId: browserId() }),
      // A STALLED CONNECTION MUST NOT WEDGE A CLICK. Without this the fetch can
      // hang indefinitely: that click's in-flight unit never settles, so the
      // count stays optimistically one high until a reload. (Clicks are parallel,
      // so a stall no longer blocks LATER clicks — but each one still has to end.)
      // The abort surfaces as a throw and lands in the retryable `error` path below.
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const { total, remaining } = await res.json();
      recordSpend(kind, id);
      return { ok: true, total, remaining };
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      // Mirror the server's verdict so the button stops asking again this day —
      // including for a network cap the client had no way to predict.
      if (body.reason === "item-cap") {
        safeSet(spentKey(kind, id), String(CLIENT_ITEM_CAP));
      }
      return {
        ok: false,
        reason: body.reason === "ip-cap" ? "ip-cap" : "item-cap",
      };
    }
    if (res.status === 404) return { ok: false, reason: "missing" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
