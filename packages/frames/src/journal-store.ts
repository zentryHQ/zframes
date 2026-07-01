import { useSyncExternalStore } from "react";
import { DOWN_COLOR, UP_COLOR } from "./format";

// Shared state for the decision-journal frame family. Log writes here; Open,
// Results, and Scoreboard read here — so a call logged in one frame shows up
// live in the others (they all import this one module singleton, even though
// GridStack mounts each frame in its own React root).
//
// Scaffold: an in-memory mock seeded at module load. Production swaps this for a
// journal.json round-trip (same contract as the daily brief's analysis log).

export type Dir = "long" | "short";
export type ThesisClass =
  "mean-reversion" | "breakout" | "positioning" | "macro";

export const CLASS_LABEL: Record<ThesisClass, string> = {
  "mean-reversion": "mean-reversion",
  breakout: "breakout",
  positioning: "positioning",
  macro: "macro",
};

export interface OpenCall {
  id: string;
  symbol: string;
  dir: Dir;
  confidence: number; // 0–100
  claim: string;
  cls: ThesisClass;
  entry: number;
  target: number;
  resolveAt: number; // epoch ms
}

export interface ResolvedCall {
  id: string;
  symbol: string;
  dir: Dir;
  confidence: number;
  claim: string;
  cls: ThesisClass;
  verdict: "hit" | "miss";
  returnPct: number; // realized % return = price move × direction
  signalsFired?: boolean; // mechanism axis — the softer, AI-assisted signal
}

// The supported, gradeable universe — only symbols that exist as Hyperliquid
// markets can be tracked + graded against the tape, so Log makes the user PICK
// from this list. Stocks are HIP-3 perps ("xyz:NVDA"); crypto stays bare.
// (Production sources this from the live Hyperliquid universe / the dashboard's
// symbols.) Prices are mock spot.
export const BASE_PRICE: Record<string, number> = {
  BTC: 67250,
  ETH: 3540,
  SOL: 146,
  HYPE: 28.4,
  "xyz:NVDA": 128.4,
  "xyz:TSLA": 251,
  "xyz:AAPL": 195,
  "xyz:MSFT": 415,
  "xyz:AMZN": 184,
};

export const SUPPORTED = Object.keys(BASE_PRICE);
export const HOUR = 3_600_000;

export function dirColor(dir: Dir): string {
  return dir === "long" ? UP_COLOR : DOWN_COLOR;
}

// The grade, in one line: % return = price move × your direction. Used both
// live (unrealized, vs the current mid) and at resolution (vs the horizon price).
export function callReturn(
  call: { entry: number; dir: Dir },
  price: number,
): number {
  return (
    ((price - call.entry) / call.entry) * 100 * (call.dir === "long" ? 1 : -1)
  );
}

// How far price has travelled from entry (0) to target (1), for the progress
// track. Signed denominator, so it works for longs and shorts alike.
export function targetFrac(
  call: { entry: number; target: number },
  price: number,
): number {
  if (call.target === call.entry) return 0;
  return Math.min(
    1,
    Math.max(0, (price - call.entry) / (call.target - call.entry)),
  );
}

export function timeUntil(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m left`;
  if (s < 86400) return `${Math.round(s / 3600)}h left`;
  return `${Math.round(s / 86400)}d left`;
}

// Guess the thesis class from the words in a read — drives the pre-decision
// mirror in Log and the class tag on cards. The user never has to pick it.
export function guessClass(text: string): ThesisClass {
  const t = text.toLowerCase();
  if (
    /(funding|squeeze|oversold|overbought|revert|bounce|reclaim range)/.test(t)
  )
    return "mean-reversion";
  if (
    /(breakout|break out|reclaim|continuation|new high|momentum|runs)/.test(t)
  )
    return "breakout";
  if (/(cpi|fomc|rate|macro|jobs|earnings|fed)/.test(t)) return "macro";
  return "positioning";
}

// The user's own record per thesis class — powers the pre-decision mirror and
// the scoreboard's edge/leak readout. (Mock; production computes it from the
// graded ledger.)
export const CLASS_RECORD: Record<ThesisClass, { n: number; hits: number }> = {
  "mean-reversion": { n: 14, hits: 9 },
  breakout: { n: 9, hits: 3 },
  positioning: { n: 11, hits: 6 },
  macro: { n: 6, hits: 3 },
};

// Resolution horizon per thesis class — the reason you pick sets WHEN the call
// is graded, so you never tap a separate date. A call resolves at this horizon
// (or early, if you close it).
export const HORIZON_BY_CLASS: Record<ThesisClass, number> = {
  "mean-reversion": 3 * 24 * HOUR,
  breakout: 7 * 24 * HOUR,
  positioning: 2 * 24 * HOUR,
  macro: 7 * 24 * HOUR,
};

// The two-axis grade: outcome × mechanism. The point of the whole loop — a hit
// on a thesis that never fired is LUCK, not skill, and shouldn't be reinforced.
export function attribution(c: ResolvedCall): {
  label: string;
  color: string;
  glyph: string;
} {
  if (c.verdict === "hit" && c.signalsFired)
    return { label: "thesis played out · skill", color: UP_COLOR, glyph: "✓" };
  if (c.verdict === "hit" && !c.signalsFired)
    return {
      label: "signals never fired · luck, not skill",
      color: "#f4a259",
      glyph: "⚠",
    };
  if (c.verdict === "miss" && c.signalsFired)
    return {
      label: "mechanism real, got swamped · near-miss",
      color: "#f4a259",
      glyph: "↺",
    };
  return {
    label: "thesis was wrong · clean miss",
    color: DOWN_COLOR,
    glyph: "✗",
  };
}

// Seeded resolved examples so the Results/Scoreboard frames aren't empty before
// you've graded anything. Open starts empty — your own logged call (captured at
// the live entry) is what populates it and grades for real.
const SEED_RESOLVED: ResolvedCall[] = [
  {
    id: "r1",
    symbol: "ETH",
    dir: "long",
    confidence: 60,
    claim: "Basis reset + spot bid stepping in under 3.4k.",
    cls: "mean-reversion",
    verdict: "hit",
    returnPct: 4.2,
    signalsFired: true,
  },
  {
    id: "r2",
    symbol: "xyz:TSLA",
    dir: "long",
    confidence: 75,
    claim: "Breakout over 250 holds and extends.",
    cls: "breakout",
    verdict: "miss",
    returnPct: -3.1,
    signalsFired: false,
  },
  {
    id: "r3",
    symbol: "BTC",
    dir: "short",
    confidence: 58,
    claim: "Crowded longs flush on the funding reset.",
    cls: "positioning",
    verdict: "miss",
    returnPct: -2.4,
    signalsFired: true,
  },
  {
    id: "r4",
    symbol: "xyz:AAPL",
    dir: "long",
    confidence: 65,
    claim: "Gap fill into the print.",
    cls: "breakout",
    verdict: "hit",
    returnPct: 1.8,
    signalsFired: false,
  },
];

let openCalls: OpenCall[] = [];
let resolvedCalls: ResolvedCall[] = SEED_RESOLVED;
let snapshot = { open: openCalls, resolved: resolvedCalls };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { open: openCalls, resolved: resolvedCalls };
  for (const l of listeners) l();
}

/** Append a freshly-logged call to the open list. `entry` is the live price at
 *  log time (falls back to mock spot); `cls` comes from the chosen reason. */
export function logCall(input: {
  sym: string;
  dir: Dir;
  confidence: number;
  claim: string;
  cls?: ThesisClass;
  entry?: number;
}): void {
  const now = Date.now();
  const cls = input.cls ?? guessClass(input.claim);
  const entry = input.entry ?? BASE_PRICE[input.sym] ?? 100;
  const target = entry * (input.dir === "long" ? 1.03 : 0.97);
  openCalls = [
    {
      id: `u${now}`,
      symbol: input.sym,
      dir: input.dir,
      confidence: input.confidence,
      claim: input.claim,
      cls,
      entry,
      target,
      resolveAt: now + HORIZON_BY_CLASS[cls],
    },
    ...openCalls,
  ];
  emit();
}

/** Grade a call by closing it at `exitPrice` (its horizon price, or early if
 *  you close it now) → realized % return, verdict from the sign. Moves it from
 *  open to resolved. The mechanism axis is left undefined here — that's the
 *  softer, AI-assisted signal, not part of the mechanical return grade. */
export function resolveCall(id: string, exitPrice: number): void {
  const call = openCalls.find((c) => c.id === id);
  if (!call) return;
  const returnPct = callReturn(call, exitPrice);
  const resolved: ResolvedCall = {
    id: call.id,
    symbol: call.symbol,
    dir: call.dir,
    confidence: call.confidence,
    claim: call.claim,
    cls: call.cls,
    verdict: returnPct >= 0 ? "hit" : "miss",
    returnPct,
  };
  openCalls = openCalls.filter((c) => c.id !== id);
  resolvedCalls = [resolved, ...resolvedCalls];
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Subscribe a frame to the shared journal; re-renders on any logged call. */
export function useJournal() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
