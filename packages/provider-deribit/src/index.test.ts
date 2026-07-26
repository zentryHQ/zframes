import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionsExpiryStrikes, OptionsSummary } from "@zframes/spec";
import type { DeribitProvider as DeribitProviderType } from "./index";

// What this file pins: every derivation DeribitProvider makes from ONE ~400 KB
// book-summary payload. The put/call-ratio, max-pain and OI-by-strike frames
// have no upstream figure to compare against — whatever this provider computes
// IS the options read the user acts on — so each rule is asserted against
// hand-checked arithmetic:
//
//  - instrument parsing: only `<CCY>-DDMMMYY-<strike>-[CP]` rows count, so
//    BTC-PERPETUAL and dated futures can never pollute an accumulator, while a
//    decimal strike (`-2750.5-P`) still parses.
//  - expiry parsing: DDMMMYY → 08:00 UTC settlement, 1- and 2-digit days,
//    2000+YY, and +Infinity for an unknown month token (so it sorts last).
//  - the divide-by-zero guards: a call-less book must report 0, never
//    Infinity/NaN, for both put/call ratios.
//  - avgIv is OI-WEIGHTED, so a zero-OI row quoting a wild IV cannot move it.
//  - nearest-expiry selection is "earliest expiryMs STRICTLY greater than now",
//    with a fallback to the earliest overall when the whole board is past — an
//    off-by-one here silently renders the wrong strike ladder.
//  - DVOL maps tuple index 4 (the CLOSE), not 1 (the open), and its cache key
//    spans currency + resolution + window start.
//
// Both TtlCaches are module-level singletons, so every test re-imports the
// module through `vi.resetModules()` and starts with empty caches; otherwise one
// primed good value would be served stale-on-error and mask each error path. The
// clock is frozen so `Date.now()`-dependent output (asOf, the DVOL
// end_timestamp, the nearest expiry) is deterministic.

async function freshProvider(): Promise<DeribitProviderType> {
  vi.resetModules();
  const mod = await import("./index");
  return new mod.DeribitProvider();
}

/** A minimal Response-like the shared fetchJson understands (ok + json()). */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const SUMMARY_URL =
  "https://www.deribit.com/api/v2/public/get_book_summary_by_currency";
const DVOL_URL =
  "https://www.deribit.com/api/v2/public/get_volatility_index_data";

/** Frozen wall clock: after 10JUL26 expiry, before 31JUL26. */
const NOW = Date.parse("2026-07-20T00:00:00Z");
/** Deribit settles at 08:00 UTC on the expiry date. */
const JUL10 = Date.UTC(2026, 6, 10, 8, 0, 0);
const JUL31 = Date.UTC(2026, 6, 31, 8, 0, 0);
const AUG28 = Date.UTC(2026, 7, 28, 8, 0, 0);

const UNDERLYING = 70_000;

interface Row {
  instrument_name: string;
  open_interest?: number;
  volume?: number;
  mark_iv?: number;
  underlying_price?: number;
}

function row(
  instrument_name: string,
  openInterest: number,
  volume: number,
  markIv: number,
  underlyingPrice: number = UNDERLYING,
): Row {
  return {
    instrument_name,
    open_interest: openInterest,
    volume,
    mark_iv: markIv,
    underlying_price: underlyingPrice,
  };
}

/** Stub fetch with one canned book-summary body for every currency. */
function stubSummary(rows: Row[]) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse({ result: rows as unknown }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** `allExpiries` is optional on the type; read it without a non-null assert. */
function expiriesOf(summary: OptionsSummary): OptionsExpiryStrikes[] {
  return summary.allExpiries ?? [];
}

describe("DeribitProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", async () => {
    const provider = await freshProvider();
    expect(provider.name).toBe("deribit");
    expect([...provider.capabilities]).toEqual([
      "options-summary",
      "volatility-index",
    ]);
  });

  describe("getOptionsSummary", () => {
    it("counts only option rows and totals each side", async () => {
      // The two non-option rows lead the payload on purpose: if the instrument
      // regex stopped skipping them, their giant OI/volume would swamp the
      // totals and their underlying (1) would become the reference price.
      const fetchMock = stubSummary([
        row("BTC-PERPETUAL", 9_000_000, 8_888, 999, 1),
        row("BTC-26JUN26", 5_000, 400, 111, 1),
        row("BTC-31JUL26-69000-C", 100, 10, 50),
        row("BTC-31JUL26-69000-P", 50, 4, 60),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("btc");

      expect(summary.currency).toBe("BTC");
      expect(summary.callOi).toBe(100);
      expect(summary.putOi).toBe(50);
      expect(summary.callVolume).toBe(10);
      expect(summary.putVolume).toBe(4);
      expect(summary.putCallRatioOi).toBe(0.5);
      expect(summary.putCallRatioVolume).toBe(0.4);
      expect(summary.underlyingPrice).toBe(UNDERLYING);
      expect(summary.asOf).toBe(NOW);
      // Only the one real option strike reaches the ladder.
      expect(summary.nearestExpiry.strikes.map((s) => s.strike)).toEqual([
        69_000,
      ]);
      expect(expiriesOf(summary).map((e) => e.expiry)).toEqual(["31JUL26"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${SUMMARY_URL}?currency=BTC&kind=option`,
      );
    });

    it("defaults an absent open_interest / volume to 0 rather than NaN", async () => {
      stubSummary([
        // No open_interest, no volume — the raw JSON a thin book can return.
        { instrument_name: "BTC-31JUL26-69000-C", mark_iv: 50 },
        row("BTC-31JUL26-69000-P", 20, 2, 60),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(summary.callOi).toBe(0);
      expect(summary.callVolume).toBe(0);
      expect(summary.putOi).toBe(20);
      expect(summary.putVolume).toBe(2);
      // Zero-weight rows carry no IV weight, so the put alone sets the average.
      expect(summary.avgIv).toBe(60);
      expect(summary.nearestExpiry.strikes[0]).toEqual({
        strike: 69_000,
        callOi: 0,
        putOi: 20,
        callIv: 50,
        putIv: 60,
      });
    });

    it("guards both put/call ratios to 0 on a call-less book", async () => {
      // Puts only: without the `callOi > 0` / `callVolume > 0` guards these
      // would be Infinity, which renders as a confident nonsense ratio.
      stubSummary([
        row("BTC-31JUL26-60000-P", 20, 3, 55),
        row("BTC-31JUL26-65000-P", 10, 2, 58),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(summary.callOi).toBe(0);
      expect(summary.callVolume).toBe(0);
      expect(summary.putOi).toBe(30);
      expect(summary.putVolume).toBe(5);
      expect(summary.putCallRatioOi).toBe(0);
      expect(summary.putCallRatioVolume).toBe(0);
    });

    it("keeps the OI ratio while guarding the volume ratio on an untraded board", async () => {
      // Both sides hold OI but nothing traded in 24h: putVolume/callVolume would
      // be NaN (0/0) without the guard, while the OI ratio is perfectly real.
      stubSummary([
        row("BTC-31JUL26-69000-C", 100, 0, 50),
        row("BTC-31JUL26-69000-P", 40, 0, 60),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(summary.putCallRatioOi).toBe(0.4);
      expect(summary.putCallRatioVolume).toBe(0);
    });

    it("weights avgIv by open interest and ignores zero-OI / non-finite rows", async () => {
      stubSummary([
        row("BTC-31JUL26-69000-C", 100, 1, 50),
        row("BTC-31JUL26-70000-P", 300, 1, 70),
        // Zero OI, wild quote: a straight mean would drag avgIv to ~297.
        row("BTC-31JUL26-71000-C", 0, 1, 999),
        // OI counts toward the totals, its non-finite IV counts toward nothing.
        row("BTC-31JUL26-72000-P", 50, 1, Number.NaN),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      // (100×50 + 300×70) / (100 + 300) = 26 000 / 400
      expect(summary.avgIv).toBe(65);
      expect(summary.callOi).toBe(100);
      expect(summary.putOi).toBe(350);

      const strikes = summary.nearestExpiry.strikes;
      const byStrike = (strike: number) =>
        strikes.find((s) => s.strike === strike);
      // Per-strike IV is a quote, not a weight: the zero-OI row still publishes
      // its IV on the ladder even though it is excluded from the average.
      expect(byStrike(71_000)?.callIv).toBe(999);
      expect(byStrike(71_000)?.callOi).toBe(0);
      expect(byStrike(72_000)?.putIv).toBeUndefined();
      expect(byStrike(72_000)?.putOi).toBe(50);
    });

    it("returns avgIv 0 when no row carries open interest", async () => {
      stubSummary([
        row("BTC-31JUL26-69000-C", 0, 5, 80),
        row("BTC-31JUL26-69000-P", 0, 3, 90),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      // Zero total weight → 0, not NaN from a 0/0 division.
      expect(summary.avgIv).toBe(0);
      // Volume still divides normally, so the payload isn't simply ignored.
      expect(summary.putCallRatioVolume).toBe(0.6);
    });

    it("locks underlyingPrice onto the first usable value seen", async () => {
      stubSummary([
        row("BTC-31JUL26-69000-C", 10, 1, 50, Number.NaN),
        // 0 is falsy, so the `!underlyingPrice` guard still treats it as unset —
        // a zero underlying is not a price anyone can trade against.
        row("BTC-31JUL26-69000-P", 10, 1, 50, 0),
        row("BTC-31JUL26-70000-C", 10, 1, 50, 71_000),
        // Later rows must never overwrite it.
        row("BTC-31JUL26-70000-P", 10, 1, 50, 99_999),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(summary.underlyingPrice).toBe(71_000);
    });

    it("parses a decimal strike, 1- and 2-digit days, and 08:00 UTC settlement", async () => {
      stubSummary([
        row("ETH-1AUG26-2750.5-P", 5, 1, 40),
        row("ETH-31DEC26-3000-C", 5, 1, 40),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("ETH");

      expect(
        expiriesOf(summary).map((e) => [e.expiry, e.expiryMs] as const),
      ).toEqual([
        ["1AUG26", Date.UTC(2026, 7, 1, 8, 0, 0)],
        ["31DEC26", Date.UTC(2026, 11, 31, 8, 0, 0)],
      ]);
      expect(expiriesOf(summary)[0].strikes[0].strike).toBe(2750.5);
      expect(summary.currency).toBe("ETH");
    });

    it("sorts an unknown month token last with an infinite expiry", async () => {
      stubSummary([
        // The unparseable month leads the payload; it must still sort last.
        row("BTC-31XYZ26-70000-C", 4, 1, 45),
        row("BTC-31JUL26-70000-C", 6, 1, 45),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(expiriesOf(summary).map((e) => e.expiry)).toEqual([
        "31JUL26",
        "31XYZ26",
      ]);
      expect(expiriesOf(summary)[0].expiryMs).toBe(JUL31);
      expect(expiriesOf(summary)[1].expiryMs).toBe(Number.POSITIVE_INFINITY);
      // The real dated expiry is still the nearest one.
      expect(summary.nearestExpiry.expiry).toBe("31JUL26");
    });

    it("picks the earliest expiry still in the future", async () => {
      // One unique strike per expiry, so the chosen ladder is identifiable.
      stubSummary([
        row("BTC-28AUG26-80000-C", 8, 1, 52),
        row("BTC-10JUL26-60000-C", 9, 1, 48),
        row("BTC-31JUL26-69000-C", 7, 1, 50),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(summary.nearestExpiry.expiry).toBe("31JUL26");
      expect(summary.nearestExpiry.expiryMs).toBe(JUL31);
      expect(summary.nearestExpiry.strikes.map((s) => s.strike)).toEqual([
        69_000,
      ]);
      expect(summary.nearestExpiry.strikes[0].callOi).toBe(7);
    });

    it("treats an expiry landing exactly on now as past (strictly greater)", async () => {
      vi.setSystemTime(JUL31);
      stubSummary([
        row("BTC-31JUL26-69000-C", 7, 1, 50),
        row("BTC-28AUG26-80000-C", 8, 1, 52),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      // 31JUL26 settles at exactly `now`, so it is no longer tradable.
      expect(summary.nearestExpiry.expiry).toBe("28AUG26");
      expect(summary.nearestExpiry.expiryMs).toBe(AUG28);
    });

    it("falls back to the earliest expiry when the whole board is past", async () => {
      vi.setSystemTime(Date.parse("2026-12-31T00:00:00Z"));
      stubSummary([
        row("BTC-31JUL26-69000-C", 7, 1, 50),
        row("BTC-10JUL26-60000-C", 9, 1, 48),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      // Earliest overall — never an empty ladder.
      expect(summary.nearestExpiry.expiry).toBe("10JUL26");
      expect(summary.nearestExpiry.expiryMs).toBe(JUL10);
      expect(summary.nearestExpiry.strikes.map((s) => s.strike)).toEqual([
        60_000,
      ]);
      expect(summary.nearestExpiry.strikes[0].callOi).toBe(9);
    });

    it("returns every expiry ascending, with nearestExpiry matching its entry", async () => {
      stubSummary([
        row("BTC-28AUG26-80000-C", 8, 1, 52),
        row("BTC-10JUL26-60000-C", 9, 1, 48),
        row("BTC-31JUL26-69000-C", 7, 1, 50),
        row("BTC-31JUL26-69000-P", 3, 1, 51),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(expiriesOf(summary).map((e) => e.expiry)).toEqual([
        "10JUL26",
        "31JUL26",
        "28AUG26",
      ]);
      expect(expiriesOf(summary).map((e) => e.expiryMs)).toEqual([
        JUL10,
        JUL31,
        AUG28,
      ]);
      const entry = expiriesOf(summary).find(
        (e) => e.expiry === summary.nearestExpiry.expiry,
      );
      // The nearest-expiry object and its allExpiries twin cannot disagree.
      expect(entry).toEqual(summary.nearestExpiry);
      expect(summary.nearestExpiry.expiry).toBe("31JUL26");
    });

    it("accumulates per strike and side, summing repeated rows, ascending", async () => {
      stubSummary([
        row("BTC-31JUL26-75000-C", 1, 1, 50),
        row("BTC-31JUL26-69000-C", 10, 1, 55),
        // Same strike AND side again: OI sums, the later finite IV wins.
        row("BTC-31JUL26-69000-C", 5, 1, 57),
        row("BTC-31JUL26-69000-P", 7, 1, Number.NaN),
        row("BTC-31JUL26-60000-P", 3, 1, 61),
      ]);

      const summary = await (await freshProvider()).getOptionsSummary("BTC");

      expect(summary.nearestExpiry.strikes).toEqual([
        { strike: 60_000, callOi: 0, putOi: 3, callIv: undefined, putIv: 61 },
        { strike: 69_000, callOi: 15, putOi: 7, callIv: 57, putIv: undefined },
        { strike: 75_000, callOi: 1, putOi: 0, callIv: 50, putIv: undefined },
      ]);
      // Explicit: a non-finite mark IV leaves that side's IV absent, it does not
      // land as NaN on the ladder.
      expect(summary.nearestExpiry.strikes[1].putIv).toBeUndefined();
      expect(summary.nearestExpiry.strikes[0].callIv).toBeUndefined();
    });

    it("throws a labelled error on an empty or non-array result", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ result: [] }))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({ result: { rows: [] } }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      // Failures are never written to the cache, so each call retries and throws.
      for (let i = 0; i < 3; i++) {
        await expect(provider.getOptionsSummary("BTC")).rejects.toThrow(
          /unexpected response shape/,
        );
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("caches per upper-cased currency across instances", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        const ccy = /currency=([A-Z]+)/.exec(String(url))?.[1] ?? "";
        return Promise.resolve(
          jsonResponse({
            result: [row(`${ccy}-31JUL26-69000-C`, 10, 1, 50)],
          }),
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      vi.resetModules();
      const mod = await import("./index");
      const btc = await new mod.DeribitProvider().getOptionsSummary("btc");
      // A second instance shares the module-level cache — same key, no fetch.
      const again = await new mod.DeribitProvider().getOptionsSummary("BTC");
      expect(again).toEqual(btc);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const eth = await new mod.DeribitProvider().getOptionsSummary("eth");
      expect(eth.currency).toBe("ETH");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(
        `${SUMMARY_URL}?currency=ETH&kind=option`,
      );
    });
  });

  describe("getVolatilityIndex", () => {
    /** [timestampMs, open, high, low, close] — close is index 4. */
    const DVOL = [
      [3_000, 40, 45, 39, 42],
      [1_000, 30, 33, 29, 31],
      [2_000, 50, 55, 49, 52],
    ];

    it("maps each tuple's CLOSE value and sorts ascending by time", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ result: { data: DVOL } }));
      vi.stubGlobal("fetch", fetchMock);

      const points = await (
        await freshProvider()
      ).getVolatilityIndex("btc", 1_000, 60);

      // Reading index 1 (the open) would give 30 / 50 / 40 here.
      expect(points).toEqual([
        { time: 1_000, value: 31 },
        { time: 2_000, value: 52 },
        { time: 3_000, value: 42 },
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${DVOL_URL}?currency=BTC&start_timestamp=1000` +
          `&end_timestamp=${NOW}&resolution=60`,
      );
    });

    it("returns an empty series for an empty data array", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ result: { data: [] } })),
      );

      await expect(
        (await freshProvider()).getVolatilityIndex("BTC", 1_000, 60),
      ).resolves.toEqual([]);
    });

    it("throws a labelled error when data is missing or not an array", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ result: {} }))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({ result: { data: null } }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      for (let i = 0; i < 3; i++) {
        await expect(
          provider.getVolatilityIndex("BTC", 1_000, 60),
        ).rejects.toThrow(/unexpected response shape/);
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("keys the cache on currency, resolution AND window start", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ result: { data: DVOL } }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getVolatilityIndex("BTC", 1_000, 60);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Same key (currency upper-cased) → served from cache.
      await provider.getVolatilityIndex("btc", 1_000, 60);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Each of the three key components must force its own request.
      await provider.getVolatilityIndex("ETH", 1_000, 60);
      await provider.getVolatilityIndex("BTC", 1_000, 3_600);
      await provider.getVolatilityIndex("BTC", 2_000, 60);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls[1]).toContain("currency=ETH");
      expect(urls[2]).toContain("resolution=3600");
      expect(urls[3]).toContain("start_timestamp=2000");
    });
  });
});
