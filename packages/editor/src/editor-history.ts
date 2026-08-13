/**
 * The editor's undo/redo kernel — a linear history of whole-spec snapshots.
 *
 * Why whole snapshots rather than a command stack: the editor's edit surface is
 * already spread across three storage models (GridStack owns positions,
 * `instancesRef` owns frame data, ~28 React states own cosmetics), and every one
 * of them can already be *read* in one shot by `collectSpec()` and *written* in
 * one shot by the editor's `applySpec()`. A snapshot history therefore needs no
 * per-surface inverse operations — the two functions that already exist are the
 * whole implementation, so a new cosmetic control or a new grid interaction
 * becomes undoable without touching this file. Boards are tens of frames, not
 * thousands, so the memory cost of a capped snapshot list is irrelevant.
 *
 * Index 0 is the baseline captured when customise mode opens, which makes three
 * behaviours fall out of one model: `undo` walks back toward it, `Cancel` jumps
 * straight to it, and "are there unsaved changes?" is just `index !== 0`.
 */

/** Snapshots kept per session. Deep-dragging every slider for an hour shouldn't
 *  grow the heap without bound; the oldest states past this are the ones nobody
 *  walks back to. The baseline (index 0) is never evicted — Cancel needs it. */
export const HISTORY_LIMIT = 100;

/** Snapshot budget expressed in FRAMES rather than entries: 100 snapshots of a
 *  30-frame board is fine; 100 snapshots of a 300-frame board is 30k frame
 *  objects (plus their JSON encodings) held for undo states nobody walks back
 *  to. `historyLimitFor` shrinks the entry cap so entries × frames stays
 *  around this. */
export const MAX_RETAINED_FRAMES = 3000;

/** The effective history cap for a board of `frameCount` frames — HISTORY_LIMIT
 *  for ordinary boards, proportionally fewer for very large ones, never below
 *  2 (the baseline plus one edit, or undo stops existing). */
export function historyLimitFor(frameCount: number): number {
  if (!Number.isFinite(frameCount) || frameCount <= 0) return HISTORY_LIMIT;
  return Math.max(
    2,
    Math.min(HISTORY_LIMIT, Math.floor(MAX_RETAINED_FRAMES / frameCount)),
  );
}

export type History<T> = {
  /** Oldest → newest. `entries[0]` is the session baseline. */
  readonly entries: readonly T[];
  /** Which entry is currently applied. */
  readonly index: number;
};

export function initHistory<T>(baseline: T): History<T> {
  return { entries: [baseline], index: 0 };
}

/**
 * Record a new state as the head.
 *
 * Two invariants callers rely on:
 * - **No-op pushes are dropped.** Every call site is a coarse "something might
 *   have changed" signal (a debounced cosmetics effect, a GridStack `dragstop`
 *   that may have landed the card back where it started, a config dialog closed
 *   without an edit), so equality-checking here is what keeps ⌘Z from needing
 *   several presses to make one visible change. Comparison is structural, on the
 *   JSON encoding — snapshots are plain spec data by construction.
 * - **A push after an undo truncates the redo tail**, the standard linear-history
 *   rule: once you edit from a rewound state, the states you'd have redone into
 *   are unreachable.
 */
export function pushHistory<T>(
  history: History<T>,
  snapshot: T,
  limit: number = HISTORY_LIMIT,
): History<T> {
  const current = history.entries[history.index];
  if (current !== undefined && encode(current) === encode(snapshot)) {
    return history;
  }
  const kept = history.entries.slice(0, history.index + 1);
  kept.push(snapshot);
  if (kept.length > limit) {
    // Drop the oldest *non-baseline* entries so Cancel keeps working on a long
    // session. The baseline is the one state the editor can never re-derive.
    kept.splice(1, kept.length - limit);
  }
  return { entries: kept, index: kept.length - 1 };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.index > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.index < history.entries.length - 1;
}

/** The snapshot to apply when undoing, or null at the baseline. */
export function undoHistory<T>(
  history: History<T>,
): { history: History<T>; snapshot: T } | null {
  if (!canUndo(history)) return null;
  const index = history.index - 1;
  return { history: { ...history, index }, snapshot: history.entries[index] };
}

/** The snapshot to apply when redoing, or null at the head. */
export function redoHistory<T>(
  history: History<T>,
): { history: History<T>; snapshot: T } | null {
  if (!canRedo(history)) return null;
  const index = history.index + 1;
  return { history: { ...history, index }, snapshot: history.entries[index] };
}

/** The session baseline — what Cancel reverts to. */
export function baselineOf<T>(history: History<T>): T {
  return history.entries[0];
}

/** True when the applied state differs from the baseline, i.e. unsaved changes
 *  exist. Undoing all the way back to the baseline correctly reads as clean. */
export function isDirty<T>(history: History<T>): boolean {
  return history.index !== 0;
}

/** Snapshots are immutable by construction (collectSpec builds fresh objects),
 *  so each one's JSON encoding is computed at most once. Without the cache,
 *  every push re-stringified the whole current spec just to compare — twice the
 *  work per push, per keystroke-sized gesture, on boards of hundreds of frames. */
const encodedCache = new WeakMap<object, string>();

function encode(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value) ?? "";
  }
  const hit = encodedCache.get(value);
  if (hit !== undefined) return hit;
  const out = JSON.stringify(value) ?? "";
  encodedCache.set(value, out);
  return out;
}

/** Fast structural equality for two frame lists, for callers deciding whether a
 *  grid rebuild is needed (see the editor's applySpec). Compares geometry + id
 *  tuples first — the cheap check that catches every drag/resize/add/delete —
 *  and falls back to one (cached where possible) JSON comparison only when the
 *  cheap pass says "same shape", to catch config-only differences. */
export function framesEqual(a: readonly unknown[], b: readonly unknown[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const fa = a[i] as {
      id?: string;
      position?: { x: number; y: number; w: number; h: number };
    };
    const fb = b[i] as {
      id?: string;
      position?: { x: number; y: number; w: number; h: number };
    };
    if (fa.id !== fb.id) return false;
    const pa = fa.position;
    const pb = fb.position;
    if (
      pa?.x !== pb?.x ||
      pa?.y !== pb?.y ||
      pa?.w !== pb?.w ||
      pa?.h !== pb?.h
    ) {
      return false;
    }
  }
  return encode(a) === encode(b);
}
