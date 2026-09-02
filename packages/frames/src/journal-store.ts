import { useSyncExternalStore } from "react";
import { DOWN_COLOR, UP_COLOR } from "./format";

// Shared state for the decision-journal frame family. Log writes here; Open,
// Results, and Scoreboard read here — so a call logged in one frame shows up
// live in the others (they all import this one module singleton, even though
// GridStack mounts each frame in its own React root).
//
// THE LEDGER IS THE USER'S OWN RECORD AND NOTHING IN IT IS INVENTED. It used to
// load four fabricated resolved calls at module scope and hold a hard-coded
// per-class hit-rate table, which the scoreboard printed as "your edge" and
// "your leak": invented trading performance presented as the reader's, on the
// one product surface where a speculative number is indefensible. Both are
// gone. Everything the family shows is computed from calls the user logged, and
// where there are none the frames say so.
//
// Durability: `localStorage`, hydrated lazily on the first subscription — see
// the storage section below for why the ledger does NOT go into the dashboard
// file the way the stopwatch's and the checklist's state does.

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

// The gradeable universe is the live one: only symbols that exist as
// Hyperliquid markets can be marked and graded against the tape, so Log picks
// from the streaming day-stats universe (HIP-3 equities as "xyz:NVDA", crypto
// bare). There is deliberately no fallback price table here — a call stamped
// with a made-up entry is a fabricated record, and `logCall` refuses one.
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

export const THESIS_CLASSES = Object.keys(CLASS_LABEL) as ThesisClass[];

function isThesisClass(value: unknown): value is ThesisClass {
  return (
    typeof value === "string" && (THESIS_CLASSES as string[]).includes(value)
  );
}

/**
 * The user's own record per thesis class, COMPUTED from the graded ledger —
 * what powers the pre-decision mirror in Log and the edge/leak readout on the
 * Scoreboard.
 *
 * This was a literal table (`mean-reversion: 9/14`, …) whose own comment
 * admitted it was a mock, and both readouts were read straight off it: a
 * first-time user was told where their judgment leaked before they had logged
 * anything. A class with `n === 0` has no reading, and every caller is expected
 * to show an empty state rather than a percentage of nothing.
 */
export function classRecord(
  resolved: ResolvedCall[],
): Record<ThesisClass, { n: number; hits: number }> {
  const out = Object.fromEntries(
    THESIS_CLASSES.map((cls) => [cls, { n: 0, hits: 0 }]),
  ) as Record<ThesisClass, { n: number; hits: number }>;
  for (const call of resolved) {
    const row = out[call.cls];
    if (!row) continue;
    row.n += 1;
    if (call.verdict === "hit") row.hits += 1;
  }
  return out;
}

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

// Both lists start EMPTY. Four invented resolved calls used to be assigned
// here, so a board opened for the first time showed a graded record its owner
// had never made.
let openCalls: OpenCall[] = [];
let resolvedCalls: ResolvedCall[] = [];
let snapshot = { open: openCalls, resolved: resolvedCalls };
const listeners = new Set<() => void>();

// ── where the ledger lives ──────────────────────────────────────────────────
//
// `localStorage`, under ONE key shared by the whole family — deliberately not
// the dashboard file, which is where the stopwatch and the checklist keep their
// self-patched state. Four reasons the frame-config route is wrong here:
//
//   1. One ledger, four frames. A frame patches its OWN card, so a config field
//      would put a copy of the whole ledger in up to four cards of one
//      dashboard.json, with four writers holding divergent snapshots.
//   2. The writer need not be on the board. Open, Results and Scoreboard are
//      independently addable, and a board without Log would persist nothing.
//   3. Open auto-resolves on a one-second clock, so a config write would fire
//      board-file saves on a timer.
//   4. A patcher only exists on a desktop board with a write-back server. A
//      personal record is the last thing that should evaporate because the
//      board happens to be served statically — `localStorage` covers that case
//      and the served one alike.
//
// The key carries no board id on purpose: the journal is the user's record, not
// a property of one dashboard, so it follows them across boards on an origin.
const STORAGE_KEY = "zframes.journal.v1";

/** The store, or null where there isn't one. A `localStorage` ACCESS can throw
 *  outright (Safari private browsing, a blocked third-party frame), so this is
 *  a try/catch rather than a `typeof window` test. */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Stored JSON is untrusted input: it survives across releases, and a user can
// edit or truncate it. A malformed entry is dropped rather than allowed to
// reach a frame as a call with no `entry` and crash the card.
function isCallBase(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.symbol === "string" &&
    (value.dir === "long" || value.dir === "short") &&
    isFiniteNumber(value.confidence) &&
    typeof value.claim === "string" &&
    isThesisClass(value.cls)
  );
}

function isOpenCall(value: unknown): value is OpenCall {
  return (
    isCallBase(value) &&
    isFiniteNumber(value.entry) &&
    isFiniteNumber(value.target) &&
    isFiniteNumber(value.resolveAt)
  );
}

function isResolvedCall(value: unknown): value is ResolvedCall {
  return (
    isCallBase(value) &&
    (value.verdict === "hit" || value.verdict === "miss") &&
    isFiniteNumber(value.returnPct)
  );
}

function readList<T>(
  value: unknown,
  key: string,
  guard: (entry: unknown) => entry is T,
): T[] {
  if (!isRecord(value)) return [];
  const list = value[key];
  return Array.isArray(list) ? list.filter(guard) : [];
}

let hydrated = false;

/** Read the stored ledger once, on the client. Called from `subscribe` (which
 *  React runs in an effect, never during a server render) and from every
 *  mutation, so an in-memory write can't be persisted over stored history. */
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const store = storage();
  if (!store) return;
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    const open = readList(parsed, "open", isOpenCall);
    const resolved = readList(parsed, "resolved", isResolvedCall);
    if (open.length === 0 && resolved.length === 0) return;
    openCalls = open;
    resolvedCalls = resolved;
    emit();
  } catch {
    // A corrupt entry is not a reason to lose the frames; the session simply
    // starts from an empty ledger and the next write replaces the bad value.
  }
}

function persist(): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, open: openCalls, resolved: resolvedCalls }),
    );
  } catch {
    // A full or blocked quota must not take a card down: the ledger keeps
    // working in memory for the life of the page.
  }
}

function emit() {
  snapshot = { open: openCalls, resolved: resolvedCalls };
  for (const l of listeners) l();
}

function commit() {
  persist();
  emit();
}

/**
 * Append a freshly-logged call to the open list. `cls` comes from the chosen
 * reason; `entry` is the LIVE price at log time and is required in practice —
 * the grade is measured against it, so a call stamped with an invented entry
 * would be a fabricated record. It used to fall back to a mock spot table and
 * then to a literal 100. Returns false and logs nothing when the quote isn't
 * in yet, which is the state Log's button is disabled in.
 */
export function logCall(input: {
  sym: string;
  dir: Dir;
  confidence: number;
  claim: string;
  cls?: ThesisClass;
  /** Live mid at log time, in USD (the providers' unit). */
  entry?: number;
}): boolean {
  hydrate();
  const entry = input.entry;
  if (!isFiniteNumber(entry) || entry <= 0) return false;
  const now = Date.now();
  const cls = input.cls ?? guessClass(input.claim);
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
  commit();
  return true;
}

/** Grade a call by closing it at `exitPrice` (its horizon price, or early if
 *  you close it now) → realized % return, verdict from the sign. Moves it from
 *  open to resolved. The mechanism axis is left undefined here — that's the
 *  softer, AI-assisted signal, not part of the mechanical return grade. */
export function resolveCall(id: string, exitPrice: number): void {
  hydrate();
  const call = openCalls.find((c) => c.id === id);
  if (!call) return;
  if (!isFiniteNumber(exitPrice) || exitPrice <= 0) return;
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
  commit();
}

function subscribe(fn: () => void): () => void {
  hydrate();
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
