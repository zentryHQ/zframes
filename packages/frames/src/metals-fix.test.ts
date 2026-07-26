import { describe, expect, it, vi } from "vitest";
import type { Money, SeriesPoint } from "@zframes/core";
import { formatFixPrice, onSharedFixDays } from "./metals-shared";

/**
 * The two LBMA-fix contracts in `metals-shared` that nothing else guards.
 *
 * `formatFixPrice` is the one money formatter in the frame layer with neither a
 * behavioural test nor the grep guard: `tests/currency-coverage.test.ts`
 * deliberately exempts `metals-shared.ts` ("GBP/EUR LBMA fixes are shown as
 * published"), so the exemption is exactly the thing that has to be pinned
 * here. Its rule is a two-branch policy that reads backwards until you know
 * why: a **USD** fix is the canonical unit every capability reports, so it goes
 * through `money` and follows the board's display currency, while a **GBP/EUR**
 * fix is a separate published print — the display layer converts *from* USD, so
 * routing sterling through it would multiply by the USD→GBP rate and print an
 * entirely plausible wrong number. Someone "finishing the currency migration"
 * would delete the second branch; these tests fail if they do.
 *
 * `onSharedFixDays` exists to prevent a documented rendering bug. The
 * multi-series line chart combines its series by exact date and fills a date a
 * series doesn't carry with 0, so a metal that didn't fix that day reads "$0" on
 * hover; and rebasing each series inside its own window scores gold's 58 years
 * against platinum's 36 and prints both as "the window's return". The metals
 * never share a date set by default (per-metal LBMA holiday calendars, platinum
 * and palladium starting decades later), yet `frame-smoke`'s mock series all
 * share timestamps — so the intersection renders clean there and a regression
 * would only show up on real data.
 */

/** A fix point on a given UTC date, exactly how `loadLbma` builds one. */
function at(date: string, value: number): SeriesPoint {
  return { time: Date.parse(`${date}T00:00:00Z`), value };
}

/** One point per year on 2 January, oldest→newest — a stand-in fix history. */
function yearly(
  fromYear: number,
  toYear: number,
  value: (year: number) => number,
  skip: number[] = [],
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    if (skip.includes(year)) continue;
    out.push(at(`${year}-01-02`, value(year)));
  }
  return out;
}

const years = (points: readonly SeriesPoint[]) =>
  points.map((p) => new Date(p.time).getUTCFullYear());

/**
 * A `Money` bound to a non-USD board, with `price` as a spy returning a
 * sentinel no plain formatter could produce. That makes "did this number go
 * through the display layer?" answerable from the output alone — and the rate is
 * deliberately far from 1, so a sterling fix wrongly converted would be visibly
 * ~36x too big rather than subtly off.
 */
function fakeMoney() {
  const rate = 36.2;
  const price = vi.fn((usd: number) => `฿[${usd}]`);
  const money: Money = {
    code: "THB",
    symbol: "฿",
    rate,
    converted: true,
    convert: (usd: number) => usd * rate,
    price,
    compact: (usd: number) => `฿[${usd}]C`,
    magnitude: (usd: number) => `[${usd}]M`,
  };
  return { money, price };
}

describe("formatFixPrice", () => {
  it("routes a USD fix through the board's display currency", () => {
    const { money, price } = fakeMoney();
    // The USD fix is the canonical unit, so a baht board must show baht.
    expect(formatFixPrice(2011.4, "USD", money)).toBe("฿[2011.4]");
    expect(price).toHaveBeenCalledTimes(1);
    expect(price).toHaveBeenCalledWith(2011.4);
  });

  it("renders a GBP fix as published, never through the converter", () => {
    const { money, price } = fakeMoney();
    // formatPrice's precision policy is kept — only the symbol is swapped.
    expect(formatFixPrice(2011.4, "GBP", money)).toBe("£2,011");
    // Sub-1000 fixes (a silver print) keep two decimals.
    expect(formatFixPrice(25.43, "GBP", money)).toBe("£25.43");
    // The display layer converts FROM USD; handing it sterling would multiply
    // by the USD→GBP rate. So it must not be consulted at all.
    expect(price).not.toHaveBeenCalled();
    expect(formatFixPrice(2011.4, "GBP", money)).not.toContain("฿");
    expect(formatFixPrice(2011.4, "GBP", money)).not.toContain("$");
  });

  it("renders a EUR fix as published too", () => {
    const { money, price } = fakeMoney();
    expect(formatFixPrice(1874.2, "EUR", money)).toBe("€1,874");
    expect(price).not.toHaveBeenCalled();
  });

  it("falls back to $ for an unmapped code instead of printing undefined", () => {
    const { money, price } = fakeMoney();
    // The frame schemas constrain `config.currency` to the LBMA's three, so
    // this is the defensive branch: without the `?? "$"` the replacement would
    // splice the string "undefined" in front of the amount.
    const out = formatFixPrice(2011.4, "THB", money);
    expect(out).toBe("$2,011");
    expect(out).not.toContain("undefined");
    // Still not the display path — only "USD" is the canonical unit.
    expect(price).not.toHaveBeenCalled();
  });
});

describe("onSharedFixDays", () => {
  it("is a no-op copy for a single metal", () => {
    const gold = [at("2024-01-02", 2050), at("2024-01-05", 2075)];
    const [only] = onSharedFixDays([gold]);
    expect(only).toEqual(gold);
    // A copy, not the caller's array — the frames rebase/thin what comes back.
    expect(only).not.toBe(gold);
    expect(onSharedFixDays([])).toEqual([]);
    expect(onSharedFixDays([[]])).toEqual([[]]);
  });

  it("keeps only the days every metal publishes", () => {
    // Gold's fix runs from 1968; platinum's only starts in 1990 — and here it
    // also skips 2010, standing in for a per-metal LBMA holiday.
    const gold = yearly(1990, 2020, (y) => 300 + y);
    const platinum = yearly(2000, 2020, (y) => 900 + y, [2010]);
    const [goldOut, platinumOut] = onSharedFixDays([gold, platinum]);

    const shared = yearly(2000, 2020, () => 0, [2010]).map((p) => p.time);
    expect(goldOut.map((p) => p.time)).toEqual(shared);
    expect(platinumOut.map((p) => p.time)).toEqual(shared);
    // The decade gold has to itself is gone — otherwise the chart zero-fills
    // platinum there and a hover reads "$0", and a rebase would start gold ten
    // years before platinum yet label both "the window's return".
    expect(years(goldOut)).not.toContain(1999);
    expect(years(goldOut)).not.toContain(2010);
    // Surviving points keep their own values; nothing is zero-filled or copied
    // across from the other metal.
    expect(goldOut[0]).toEqual(at("2000-01-02", 2300));
    expect(platinumOut[0]).toEqual(at("2000-01-02", 2900));
  });

  it("requires a day in ALL series, not just two of them", () => {
    const gold = yearly(2000, 2020, (y) => 300 + y);
    const platinum = yearly(2000, 2020, (y) => 900 + y);
    // Palladium's window is the short one, so it sets the shared grid.
    const palladium = yearly(2010, 2020, (y) => 500 + y);
    const out = onSharedFixDays([gold, platinum, palladium]);
    expect(out.map((points) => points.length)).toEqual([11, 11, 11]);
    for (const points of out) expect(years(points)[0]).toBe(2010);
  });

  it("empties every series when one metal has no fixes in the window", () => {
    const gold = yearly(2018, 2020, (y) => 300 + y);
    expect(onSharedFixDays([gold, []])).toEqual([[], []]);
  });

  it("miscounts a repeated date inside one series as agreement", () => {
    // The same date printed twice in one file (a correction row) — gold alone
    // reaches the "seen in every series" count.
    const gold = [at("2024-01-02", 2050), at("2024-01-02", 2055)];
    const platinum = [at("2024-01-03", 950)];
    const [goldOut, platinumOut] = onSharedFixDays([gold, platinum]);
    // KNOWN BUG: a timestamp duplicated within ONE series reaches the
    // `windows.length` count on its own, so both copies survive on a day the
    // other metal never published (and that metal is left empty) — should be
    // counted once per series, e.g. by de-duplicating each window's times
    // before tallying, which here would empty both. Pinned so the suite stays
    // green; fixing the source must flip this assertion.
    expect(goldOut).toEqual(gold);
    expect(platinumOut).toEqual([]);
  });

  it("intersects on the exact timestamp, not the UTC day", () => {
    // Unlike its sibling `alignSeries`, which rounds both sides through
    // `utcDay` before pairing, this compares `p.time` verbatim. Every LBMA
    // series is built at midnight UTC so they do line up in practice — but a
    // series carrying a clock time would drop out entirely rather than pair.
    const gold = [at("2024-01-02", 2050)];
    const msLater = [{ time: gold[0].time + 1, value: 950 }];
    expect(onSharedFixDays([gold, msLater])).toEqual([[], []]);

    const sameInstant = [{ time: gold[0].time, value: 950 }];
    expect(onSharedFixDays([gold, sameInstant])).toEqual([gold, sameInstant]);
  });
});
