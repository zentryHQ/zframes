import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  baselineOf,
  canRedo,
  canUndo,
  initHistory,
  isDirty,
  pushHistory,
  redoHistory,
  undoHistory,
} from "./editor-history";

/** A stand-in for the spec snapshots the editor actually stores. */
type Snap = { n: number; tag?: string };

describe("initHistory", () => {
  it("starts at the baseline with nothing to undo or redo", () => {
    const h = initHistory<Snap>({ n: 0 });
    expect(h.index).toBe(0);
    expect(h.entries).toHaveLength(1);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(isDirty(h)).toBe(false);
  });
});

describe("pushHistory", () => {
  it("appends a changed snapshot and advances the index", () => {
    const h = pushHistory(initHistory<Snap>({ n: 0 }), { n: 1 });
    expect(h.entries).toHaveLength(2);
    expect(h.index).toBe(1);
    expect(canUndo(h)).toBe(true);
    expect(isDirty(h)).toBe(true);
  });

  it("drops a push that is structurally identical to the applied state", () => {
    // The call sites are coarse "something might have changed" signals — a
    // GridStack dragstop that landed the card back where it started, a config
    // dialog closed without an edit. Recording those would make ⌘Z need several
    // presses to produce one visible change.
    const base = initHistory<Snap>({ n: 0, tag: "a" });
    const same = pushHistory(base, { n: 0, tag: "a" });
    expect(same).toBe(base);
    expect(same.entries).toHaveLength(1);
  });

  it("compares structurally, not by reference", () => {
    const h = initHistory<Snap>({ n: 0 });
    // Same content, different object identity — still a no-op.
    expect(pushHistory(h, { ...h.entries[0] }).entries).toHaveLength(1);
  });

  it("truncates the redo tail when editing from a rewound state", () => {
    let h = initHistory<Snap>({ n: 0 });
    h = pushHistory(h, { n: 1 });
    h = pushHistory(h, { n: 2 });
    h = undoHistory(h)!.history; // back to n:1
    expect(canRedo(h)).toBe(true);

    h = pushHistory(h, { n: 99 });
    expect(canRedo(h)).toBe(false);
    expect(h.entries.map((e) => e.n)).toEqual([0, 1, 99]);
  });

  it("caps the length while preserving the baseline", () => {
    let h = initHistory<Snap>({ n: -1 });
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      h = pushHistory(h, { n: i });
    }
    expect(h.entries).toHaveLength(HISTORY_LIMIT);
    // The baseline survives eviction — Cancel is the one state that can't be
    // re-derived from anywhere else.
    expect(baselineOf(h)).toEqual({ n: -1 });
    // The newest state is still the applied one.
    expect(h.entries[h.index]).toEqual({ n: HISTORY_LIMIT + 19 });
    expect(h.index).toBe(HISTORY_LIMIT - 1);
  });
});

describe("undo / redo", () => {
  it("walks back and forward over the same snapshots", () => {
    let h = initHistory<Snap>({ n: 0 });
    h = pushHistory(h, { n: 1 });
    h = pushHistory(h, { n: 2 });

    const back1 = undoHistory(h)!;
    expect(back1.snapshot).toEqual({ n: 1 });
    const back2 = undoHistory(back1.history)!;
    expect(back2.snapshot).toEqual({ n: 0 });
    expect(canUndo(back2.history)).toBe(false);

    const fwd = redoHistory(back2.history)!;
    expect(fwd.snapshot).toEqual({ n: 1 });
    expect(redoHistory(fwd.history)!.snapshot).toEqual({ n: 2 });
  });

  it("returns null at each end rather than clamping silently", () => {
    const h = initHistory<Snap>({ n: 0 });
    expect(undoHistory(h)).toBeNull();
    expect(redoHistory(h)).toBeNull();
  });

  it("leaves the entry list untouched — only the index moves", () => {
    let h = initHistory<Snap>({ n: 0 });
    h = pushHistory(h, { n: 1 });
    const after = undoHistory(h)!.history;
    expect(after.entries).toBe(h.entries);
  });
});

describe("isDirty", () => {
  it("reads clean again after undoing all the way back to the baseline", () => {
    let h = initHistory<Snap>({ n: 0 });
    h = pushHistory(h, { n: 1 });
    expect(isDirty(h)).toBe(true);
    h = undoHistory(h)!.history;
    expect(isDirty(h)).toBe(false);
  });

  it("still reads dirty at a rewound-but-not-baseline state", () => {
    let h = initHistory<Snap>({ n: 0 });
    h = pushHistory(h, { n: 1 });
    h = pushHistory(h, { n: 2 });
    h = undoHistory(h)!.history;
    expect(isDirty(h)).toBe(true);
  });
});
