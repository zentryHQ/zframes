// What this file pins: the two pure helper modules the whole multi-series line
// chart funnels through, neither of which had a test.
//
//  * `chart-utils.ts` — `formatChartDate` (the x-axis/tooltip granularity, via
//    `multi-series-line-chart/utils.ts`'s `formatChartDateForTimeframe`) and
//    `calculateChartDomain` (the padded y-domain, via `calculateYDomain`).
//  * `lib/format.ts` — `parseMarketData`, the DEFAULT formatter every
//    MultiSeriesLineChart falls back to when a frame passes no explicit
//    `formatValue`: it formats the y-axis ticks (`create-axes.ts`), the hover
//    tooltip (`create-interactions.ts`), the legend value
//    (`calculate-legend-positions.ts`) and the y-label width measurement
//    (`use-chart-dimensions.ts`). It is also a public `@zframes/charts` export.
//
// Why it matters: every failure mode in here is a silently WRONG PICTURE, never
// a crash — a mislabeled axis, a line pinned to the card edge, an unreadable
// tick — so the nightly headless frame-render monitor (which only flags error
// cards and thrown errors) is blind to all of it. Pure input→output tables are
// the only thing that can see these.
//
// Four real defects are pinned as-is, each tagged `KNOWN BUG:` — negatives never
// reach the T/B/M ladder, the tier boundaries fire one decade late, the
// subscript path truncates instead of rounding, and date labels are rendered in
// the host's local zone rather than the stamp's. Fixing any of them must flip
// the matching assertion here.
//
// Both modules are React-free and DOM-free, so this file deliberately runs in
// the default node environment (no `@vitest-environment jsdom` docblock) —
// importing them under plain Node is itself part of the contract.
import * as d3 from "d3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHART_COLORS_MULTI_SERIES,
  calculateChartDomain,
  formatChartDate,
} from "./chart-utils";
import { formatSmallNumber, parseMarketData } from "./lib/format";
import { ChartTimeframe, type DataPoint } from "./lib/timeframe";

/** `{date, value}` points from bare values — only `value` drives the domain. */
const pts = (...values: number[]): DataPoint[] =>
  values.map((value, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

/**
 * Run `fn` as if the host machine sat in `tz`. `formatChartDate` builds a
 * `new Date(str)` and formats it with d3's LOCAL-time formatter, so its output
 * is machine-dependent for any UTC-anchored stamp; these tests pin both sides.
 */
function inZone<T>(tz: string, fn: () => T): T {
  vi.stubEnv("TZ", tz);
  try {
    return fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatChartDate", () => {
  // Local-time stamps (an ISO date-time with no offset is parsed as local
  // time), so these two are zone-independent — the zone hazard is pinned
  // separately below.
  const APRIL = "2024-04-01T13:45:00";
  const NOVEMBER = "2019-11-05T07:05:00";

  const APRIL_BY_TIMEFRAME: Record<ChartTimeframe, string> = {
    // %b %d — the default branch: intraday-to-a-quarter windows.
    "30m": "Apr 01",
    "3D": "Apr 01",
    "7D": "Apr 01",
    "1M": "Apr 01",
    "3M": "Apr 01",
    YTD: "Apr 01",
    // %H:%M — a 24h window is all one day, so only the clock is informative.
    "24h": "13:45",
    // %b %Y / %Y — widened for multi-year and multi-decade history (the LBMA
    // fixes reach back to 1968): a repeated "Apr 01" down a decades-long axis
    // reads as noise, so a multi-year series wants month+year and a
    // multi-decade one just the year.
    "1Y": "Apr 2024",
    "5Y": "2024",
    MAX: "2024",
  };

  const NOVEMBER_BY_TIMEFRAME: Record<ChartTimeframe, string> = {
    "30m": "Nov 05",
    "3D": "Nov 05",
    "7D": "Nov 05",
    "1M": "Nov 05",
    "3M": "Nov 05",
    YTD: "Nov 05",
    "24h": "07:05",
    "1Y": "Nov 2019",
    "5Y": "2019",
    MAX: "2019",
  };

  it("documents a granularity for every timeframe the enum declares", () => {
    // A timeframe added to the enum without a branch here silently lands on the
    // "%b %d" default — wrong for anything wider than a quarter.
    expect(Object.keys(APRIL_BY_TIMEFRAME).sort()).toEqual(
      Object.values(ChartTimeframe).sort(),
    );
    expect(Object.keys(NOVEMBER_BY_TIMEFRAME).sort()).toEqual(
      Object.values(ChartTimeframe).sort(),
    );
  });

  it("maps the four branches: %H:%M, %b %Y, %Y, else %b %d", () => {
    // Two distinct dates, so a per-timeframe constant could not satisfy both.
    const april = Object.fromEntries(
      (Object.keys(APRIL_BY_TIMEFRAME) as ChartTimeframe[]).map((tf) => [
        tf,
        formatChartDate(APRIL, tf),
      ]),
    );
    const november = Object.fromEntries(
      (Object.keys(NOVEMBER_BY_TIMEFRAME) as ChartTimeframe[]).map((tf) => [
        tf,
        formatChartDate(NOVEMBER, tf),
      ]),
    );
    expect(april).toEqual(APRIL_BY_TIMEFRAME);
    expect(november).toEqual(NOVEMBER_BY_TIMEFRAME);
  });

  it("zero-pads the day and the clock", () => {
    expect(formatChartDate("2024-04-07T09:05:00", ChartTimeframe["7D"])).toBe(
      "Apr 07",
    );
    expect(formatChartDate("2024-04-07T09:05:00", ChartTimeframe["24h"])).toBe(
      "09:05",
    );
  });

  it("labels a UTC-anchored stamp a day early west of UTC", () => {
    // KNOWN BUG: the label is formatted with d3's LOCAL-time formatter, so a
    // date-only or midnight-Z stamp (what every daily series emits — see
    // `metals-shared.ts`'s `toChartData`, which stringifies via toISOString)
    // labels the PREVIOUS day in any zone behind UTC — should be formatted in
    // UTC (d3.utcFormat) so a day-stamped point keeps its own calendar date.
    // Pinned so the suite stays green; fixing the source must flip this
    // assertion.
    const tf = ChartTimeframe["1M"];
    expect(inZone("UTC", () => formatChartDate("2024-04-01", tf))).toBe(
      "Apr 01",
    );
    expect(
      inZone("America/New_York", () => formatChartDate("2024-04-01", tf)),
    ).toBe("Mar 31");
    expect(
      inZone("America/New_York", () =>
        formatChartDate("2024-04-01T00:00:00.000Z", tf),
      ),
    ).toBe("Mar 31");
  });

  it("labels a January stamp with the previous YEAR west of UTC", () => {
    // KNOWN BUG: same local-time parse, but on the %Y branch it costs a whole
    // year — the Jan-1 print of a multi-decade LBMA series is labeled 2023 —
    // should be formatted in UTC. Pinned so the suite stays green; fixing the
    // source must flip this assertion.
    expect(
      inZone("America/New_York", () =>
        formatChartDate("2024-01-01", ChartTimeframe["5Y"]),
      ),
    ).toBe("2023");
    expect(
      inZone("America/New_York", () =>
        formatChartDate("2024-01-01", ChartTimeframe["1Y"]),
      ),
    ).toBe("Dec 2023");
    expect(
      inZone("UTC", () => formatChartDate("2024-01-01", ChartTimeframe["5Y"])),
    ).toBe("2024");
  });

  it("degrades an unparseable date to a NaN label instead of throwing", () => {
    // A junk date from a provider must not take the card down; it paints a
    // visibly broken tick instead.
    expect(formatChartDate("not-a-date", ChartTimeframe["1M"])).toBe(" NaN");
    expect(formatChartDate("not-a-date", ChartTimeframe["24h"])).toBe(
      "NaN:NaN",
    );
  });
});

describe("calculateChartDomain", () => {
  it("pads the extent by 10% of the range at both ends", () => {
    // range 20 → 2 of headroom below 10 and above 30.
    expect(calculateChartDomain(pts(10, 20, 30))).toEqual([8, 32]);
    // Padding is a fraction of the RANGE, not of the values: a tight series
    // gets a tight pad.
    expect(calculateChartDomain(pts(100, 101))).toEqual([99.9, 101.1]);
  });

  it("honours an explicit padding fraction", () => {
    expect(calculateChartDomain(pts(10, 20), 0)).toEqual([10, 20]);
    expect(calculateChartDomain(pts(10, 20), 0.5)).toEqual([5, 25]);
  });

  it("clamps the floor to 0 so a non-negative series keeps a positive axis", () => {
    // Both of these would otherwise open below zero — a TVL or volume chart
    // must not imply negative values.
    expect(calculateChartDomain(pts(0, 100))).toEqual([0, 110]);
    expect(calculateChartDomain(pts(1, 100))).toEqual([0, 109.9]);
  });

  it("does not clamp a series that genuinely goes negative", () => {
    // The clamp is gated on `minValue >= 0`, so real negatives (net flows, COT
    // positioning) keep their headroom below the axis.
    expect(calculateChartDomain(pts(-10, 10))).toEqual([-12, 12]);
    expect(calculateChartDomain(pts(-30, -10))).toEqual([-32, -8]);
  });

  it("returns a zero-height domain for a flat series (d3 then centres the line)", () => {
    // A rate or a peg that has not moved is a real, shippable series: range 0 →
    // no padding → min === max.
    expect(calculateChartDomain(pts(5, 5, 5))).toEqual([5, 5]);
    expect(calculateChartDomain(pts(-7, -7))).toEqual([-7, -7]);
    expect(calculateChartDomain(pts(42))).toEqual([42, 42]);

    // A zero-height domain is DEGENERATE, not an edge-pinned one: d3-scale
    // short-circuits `domain[0] === domain[1]` to `constant(0.5)`, so every
    // input maps to the MIDPOINT of the range. `create-scales.ts` builds
    // `scaleLinear().domain(yDomain).range([innerHeight, 0])`, so the flat line
    // is drawn through the vertical centre of the plot area and the axis carries
    // a single tick at the value — the best available rendering, which is why
    // `calculateChartDomain` injects no synthetic pad for a flat series. Probed
    // rather than asserted in prose so a future reader can't "fix" the source on
    // a false premise.
    const yScale = d3
      .scaleLinear()
      .domain(calculateChartDomain(pts(5, 5, 5)))
      .range([400, 0]);
    expect([yScale(5), yScale(4), yScale(6)]).toEqual([200, 200, 200]);
    expect(yScale.ticks()).toEqual([5]);
  });

  it("falls back to [0, 0] when there is no usable value at all", () => {
    // `d3.min(values) || 0` — d3 returns undefined for an empty or all-NaN
    // series, so the domain degenerates to the origin rather than [NaN, NaN],
    // which would make d3 emit no path at all.
    expect(calculateChartDomain([])).toEqual([0, 0]);
    expect(calculateChartDomain(pts(NaN, NaN))).toEqual([0, 0]);
  });

  it("ignores non-finite points rather than poisoning the domain", () => {
    // d3.min/max skip NaN, so one bad point costs its own position, not the
    // whole chart.
    expect(calculateChartDomain(pts(NaN, 5))).toEqual([5, 5]);
    expect(calculateChartDomain(pts(NaN, 10, 20, 30))).toEqual([8, 32]);
  });
});

describe("CHART_COLORS_MULTI_SERIES", () => {
  it("holds 8 distinct hex colours (frames index it modulo its length)", () => {
    // Consumers do `CHART_COLORS_MULTI_SERIES[i % length]`; a duplicate entry
    // would render two different series in the same colour.
    expect(CHART_COLORS_MULTI_SERIES).toHaveLength(8);
    expect(new Set(CHART_COLORS_MULTI_SERIES).size).toBe(8);
    for (const color of CHART_COLORS_MULTI_SERIES) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("parseMarketData", () => {
  it("renders a missing value as a dash", () => {
    expect(parseMarketData(null)).toBe("-");
    expect(parseMarketData(undefined)).toBe("-");
  });

  it("renders an exact zero as a bare 0", () => {
    expect(parseMarketData(0)).toBe("0");
  });

  it("walks the T/B/M ladder for positive magnitudes", () => {
    expect(parseMarketData(2.5e12)).toBe("2.50T");
    expect(parseMarketData(1.5e9)).toBe("1.50B");
    expect(parseMarketData(1.5e6)).toBe("1.50M");
    expect(parseMarketData(1_000_001)).toBe("1.00M");
    // Always 2 decimals in the compact tiers, so tick labels keep one width.
    expect(parseMarketData(3e12)).toBe("3.00T");
  });

  it("groups thousands and keeps at most 2 decimals under a million", () => {
    expect(parseMarketData(1234.5678)).toBe("1,234.57");
    expect(parseMarketData(999_999.5)).toBe("999,999.5");
    expect(parseMarketData(10)).toBe("10");
  });

  it("keeps 4 significant digits below 10", () => {
    expect(parseMarketData(0.5)).toBe("0.5");
    expect(parseMarketData(0.123456789)).toBe("0.1235");
    expect(parseMarketData(2.5)).toBe("2.5");
    // Rounds up out of its own branch rather than printing "10.00".
    expect(parseMarketData(9.99999)).toBe("10");
  });

  it("only an exact 1e6 reaches the final 0-decimal branch", () => {
    // `< MILLION` is false and every `>` tier below is also false for exactly
    // one million, so it alone falls through to the no-decimals toLocaleString
    // — the one input in the whole domain that prints ungrouped-tier digits.
    expect(parseMarketData(1e6)).toBe("1,000,000");
  });

  it("switches to subscript notation below 0.001", () => {
    expect(parseMarketData(0.0005)).toBe("0.₃5");
    expect(parseMarketData(0.00012)).toBe("0.₃12");
    expect(parseMarketData(1.234e-7)).toBe("0.₆123");
    // 0.001 itself is NOT below the threshold and takes the 4-sig-fig branch.
    expect(parseMarketData(0.001)).toBe("0.001");
  });

  it("sends EVERY negative down the small-number path, so T/B/M is unreachable for negatives", () => {
    // KNOWN BUG: the first branch tests the raw `value < 0.001`, which is true
    // for every negative number, so a negative magnitude never reaches the
    // T/B/M ladder and prints its full digit string (an unreadable y-axis tick)
    // — should test `Math.abs(value) < 0.001` so -2.5e9 renders "-2.50B".
    // Pinned so the suite stays green; fixing the source must flip this
    // assertion. Latent only because the three frames with negative magnitudes
    // (etf-flows-chart, metal-cot-net, metal-open-interest) all pass an
    // explicit `formatValue`; the next one that does not ships this axis.
    expect(parseMarketData(-2.5e9)).toBe("-2500000000");
    // Grouping is lost too — formatSmallNumber's fallback is a bare String().
    expect(parseMarketData(-1234.56)).toBe("-1234.56");
    // Small negatives are the one case this path was actually meant for.
    expect(parseMarketData(-0.0005)).toBe("-0.₃5");
    expect(parseMarketData(-0.5)).toBe("-0.5");
  });

  it("drops an exact billion/trillion one tier too low", () => {
    // KNOWN BUG: the tier tests use `>` rather than `>=`, so a value sitting
    // exactly on a boundary is formatted in the tier below — should be
    // `value >= BILLION` / `>= TRILLION` so 1e9 reads "1.00B" and 1e12 reads
    // "1.00T". Pinned so the suite stays green; fixing the source must flip
    // this assertion.
    expect(parseMarketData(1e9)).toBe("1,000.00M");
    expect(parseMarketData(1e12)).toBe("1,000.00B");
  });

  it("truncates the last subscript digit instead of rounding it", () => {
    // KNOWN BUG: formatSmallNumber slices the digits out of `toFixed(20)`,
    // whose expansion of 0.0000823 is 0.00008229999999999999, so the tick reads
    // 0.₄822 — should be 0.₄823, exactly the example the function's own
    // docstring advertises. Pinned so the suite stays green; fixing the source
    // must flip this assertion.
    expect(parseMarketData(0.0000823)).toBe("0.₄822");
  });
});

describe("formatSmallNumber", () => {
  // Exported alongside parseMarketData, and the only path a negative can take
  // (see the KNOWN BUG above), so its three branches are pinned directly.
  it("counts the leading zeros into a subscript digit", () => {
    expect(formatSmallNumber(0.0005)).toBe("0.₃5");
    expect(formatSmallNumber(1.234e-7)).toBe("0.₆123");
    // At most 3 significant digits after the subscript.
    expect(formatSmallNumber(0.000123456)).toBe("0.₃123");
  });

  it("keeps an integer whole and rounds anything else to 2 decimals", () => {
    expect(formatSmallNumber(5)).toBe("5");
    expect(formatSmallNumber(-5)).toBe("-5");
    expect(formatSmallNumber(2.345)).toBe("2.35");
    expect(formatSmallNumber(2.344)).toBe("2.34");
    // No thousands separator on this path — the tick runs together.
    expect(formatSmallNumber(12345.6789)).toBe("12345.68");
  });

  it("collapses a value below the 20-decimal floor to 0, sign and all", () => {
    // toFixed(20) rounds 1e-21 away entirely, so the subscript match fails and
    // the 2-decimal fallback prints a bare 0 — a "dust" price reads as zero
    // rather than as a wrong magnitude.
    expect(formatSmallNumber(1e-21)).toBe("0");
    expect(formatSmallNumber(-1e-21)).toBe("0");
  });
});
