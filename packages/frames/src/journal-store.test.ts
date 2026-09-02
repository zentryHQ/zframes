// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "zframes.journal.v1";

/**
 * A fresh module instance — the state the first journal frame on a board sees.
 * The store is a module singleton on purpose (four frames, one ledger), so
 * "what does a new page start from" can only be asked by re-importing it.
 */
async function freshStore() {
  vi.resetModules();
  return import("./journal-store");
}

function stored(): { open: unknown[]; resolved: unknown[] } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("the journal starts empty", () => {
  it("has no open calls and no resolved ones", async () => {
    // The bug this pins: four invented resolved calls were assigned at module
    // load, so a first-time reader was shown a graded record they never made
    // — and everything derived from it (edge, leak, calibration) was fiction.
    const { useJournal } = await freshStore();
    const { result } = renderHook(() => useJournal());
    expect(result.current.open).toEqual([]);
    expect(result.current.resolved).toEqual([]);
  });
});

describe("logCall", () => {
  it("refuses a call with no live entry price", async () => {
    const { logCall } = await freshStore();
    // The grade is measured against the entry, so an invented one is a
    // fabricated record. It used to fall back to a mock spot table, and then
    // to a literal 100.
    const base = {
      sym: "BTC",
      dir: "long" as const,
      confidence: 70,
      claim: "x",
    };
    expect(logCall(base)).toBe(false);
    expect(logCall({ ...base, entry: Number.NaN })).toBe(false);
    expect(logCall({ ...base, entry: 0 })).toBe(false);
    expect(stored()).toBeNull();
  });

  it("accepts one with a live price and writes it through", async () => {
    const { logCall } = await freshStore();
    expect(
      logCall({
        sym: "BTC",
        dir: "long",
        confidence: 70,
        claim: "funding reset",
        cls: "mean-reversion",
        entry: 60_000,
      }),
    ).toBe(true);
    const snapshot = stored();
    expect(snapshot?.open).toHaveLength(1);
    // A long's target is derived as entry x 1.03.
    expect(snapshot?.open[0]).toMatchObject({
      symbol: "BTC",
      entry: 60_000,
      target: 61_800,
      cls: "mean-reversion",
    });
    expect(snapshot?.resolved).toEqual([]);
  });
});

describe("the ledger survives a reload", () => {
  it("hydrates a stored call on the first subscription", async () => {
    const first = await freshStore();
    first.logCall({
      sym: "ETH",
      dir: "short",
      confidence: 60,
      claim: "basis unwind",
      cls: "positioning",
      entry: 3_000,
    });

    // A new page: a new module instance, the same origin.
    const { useJournal } = await freshStore();
    const { result } = renderHook(() => useJournal());
    expect(result.current.open).toHaveLength(1);
    expect(result.current.open[0]).toMatchObject({
      symbol: "ETH",
      dir: "short",
      entry: 3_000,
    });
  });

  it("starts empty rather than throwing on a corrupt entry", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { useJournal } = await freshStore();
    const { result } = renderHook(() => useJournal());
    expect(result.current.open).toEqual([]);
    expect(result.current.resolved).toEqual([]);
  });

  it("drops a stored call that is missing its entry price", async () => {
    // Stored JSON outlives releases and can be hand-edited; a call with no
    // entry would reach the card and be marked against `undefined`.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        open: [
          {
            id: "x",
            symbol: "BTC",
            dir: "long",
            confidence: 70,
            claim: "x",
            cls: "breakout",
            target: 1,
            resolveAt: 1,
          },
        ],
        resolved: [],
      }),
    );
    const { useJournal } = await freshStore();
    const { result } = renderHook(() => useJournal());
    expect(result.current.open).toEqual([]);
  });
});

describe("classRecord", () => {
  it("counts only the graded calls, per thesis class", async () => {
    const { classRecord } = await freshStore();
    const record = classRecord([
      graded("breakout", "hit"),
      graded("breakout", "miss"),
      graded("macro", "hit"),
    ]);
    expect(record.breakout).toEqual({ n: 2, hits: 1 });
    expect(record.macro).toEqual({ n: 1, hits: 1 });
    // A class with nothing graded has no reading, and every caller shows an
    // empty state instead of a percentage of nothing. This used to be a
    // literal table (`mean-reversion: 9/14`) no user action could change.
    expect(record["mean-reversion"]).toEqual({ n: 0, hits: 0 });
    expect(record.positioning).toEqual({ n: 0, hits: 0 });
  });

  it("is all zeroes for an empty ledger", async () => {
    const { classRecord, THESIS_CLASSES } = await freshStore();
    const record = classRecord([]);
    for (const cls of THESIS_CLASSES)
      expect(record[cls]).toEqual({
        n: 0,
        hits: 0,
      });
  });
});

describe("resolveCall", () => {
  it("moves a call to the graded list and grades it by return", async () => {
    const store = await freshStore();
    store.logCall({
      sym: "BTC",
      dir: "long",
      confidence: 70,
      claim: "range reclaim",
      cls: "mean-reversion",
      entry: 100,
    });
    const id = (stored()?.open[0] as { id: string }).id;
    store.resolveCall(id, 110);

    const snapshot = stored();
    expect(snapshot?.open).toEqual([]);
    expect(snapshot?.resolved).toHaveLength(1);
    const call = snapshot?.resolved[0] as {
      verdict: string;
      returnPct: number;
      signalsFired?: boolean;
    };
    expect(call.verdict).toBe("hit");
    expect(call.returnPct).toBeCloseTo(10, 6);
    // The mechanical return grade leaves the mechanism axis unset — the four
    // seeded calls that used to carry it were fabrications.
    expect(call.signalsFired).toBeUndefined();
  });

  it("ignores a non-finite exit price", async () => {
    const store = await freshStore();
    store.logCall({
      sym: "BTC",
      dir: "long",
      confidence: 70,
      claim: "x",
      entry: 100,
    });
    const id = (stored()?.open[0] as { id: string }).id;
    store.resolveCall(id, Number.NaN);
    expect(stored()?.open).toHaveLength(1);
    expect(stored()?.resolved).toEqual([]);
  });
});

function graded(
  cls: "mean-reversion" | "breakout" | "positioning" | "macro",
  verdict: "hit" | "miss",
) {
  return {
    id: `${cls}-${verdict}-${Math.random()}`,
    symbol: "BTC",
    dir: "long" as const,
    confidence: 60,
    claim: "x",
    cls,
    verdict,
    returnPct: verdict === "hit" ? 1 : -1,
  };
}
