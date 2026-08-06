import { describe, expect, it } from "vitest";
import {
  dailyBarTime,
  earningsCalendarTime,
  easternDate,
  isEmptyCell,
  parseAnalystCount,
  parseHighLowPair,
  parseNumericCell,
  parseStatementTable,
  parseUsDate,
  periodKeys,
  scaleOrNull,
  tickerOf,
} from "./parse";

// Every number this provider publishes arrives as a display string, so these
// helpers are the whole correctness surface: a slip here produces a
// plausible-looking wrong figure with nothing else in the app to contradict it.
// The cases below are the literal strings observed on the wire, not invented.

describe("parseNumericCell", () => {
  it("reads money, counts and percents", () => {
    expect(parseNumericCell("$219.13")).toBe(219.13);
    expect(parseNumericCell("5,302,946,000,000")).toBe(5_302_946_000_000);
    expect(parseNumericCell("0.47%")).toBe(0.47);
    expect(parseNumericCell("+3.43%")).toBe(3.43);
    expect(parseNumericCell("10")).toBe(10);
  });

  it("keeps the sign when it sits outside the currency symbol", () => {
    expect(parseNumericCell("-$187,000")).toBe(-187_000);
    expect(parseNumericCell("-0.04%")).toBe(-0.04);
  });

  it("reads accounting parentheses as negative", () => {
    expect(parseNumericCell("($1,234)")).toBe(-1234);
    expect(parseNumericCell("( 3.62)")).toBe(-3.62);
  });

  it("takes an already-numeric field as-is", () => {
    // The surprise table types `eps` as a JSON number while its neighbours are strings.
    expect(parseNumericCell(1.87)).toBe(1.87);
    expect(parseNumericCell(0)).toBe(0);
  });

  it("returns null — never 0, never NaN — for every 'no value' cell", () => {
    for (const blank of ["", "  ", "--", "N/A", "NA", "nm", "abc", "$", "-"])
      expect(parseNumericCell(blank)).toBeNull();
    expect(parseNumericCell(undefined)).toBeNull();
    expect(parseNumericCell(null)).toBeNull();
    expect(parseNumericCell(Number.NaN)).toBeNull();
  });
});

describe("isEmptyCell", () => {
  it("separates a structural blank from a missing print", () => {
    // This distinction is what drops section headers while keeping "--" rows.
    expect(isEmptyCell("")).toBe(true);
    expect(isEmptyCell("   ")).toBe(true);
    expect(isEmptyCell(undefined)).toBe(true);
    expect(isEmptyCell("--")).toBe(false);
    expect(isEmptyCell("0")).toBe(false);
  });
});

describe("scaleOrNull", () => {
  it("scales a value and preserves the no-value signal", () => {
    expect(scaleOrNull(215_938_000, 1000)).toBe(215_938_000_000);
    expect(scaleOrNull(null, 1000)).toBeNull();
  });
});

describe("parseUsDate", () => {
  it("converts M/D/YYYY to ISO, zero-padding both parts", () => {
    expect(parseUsDate("08/05/2026")).toBe("2026-08-05");
    expect(parseUsDate("5/20/2026")).toBe("2026-05-20");
    expect(parseUsDate("8/07/2025")).toBe("2025-08-07");
  });

  it("refuses anything that isn't a real US date", () => {
    expect(parseUsDate("N/A")).toBeUndefined();
    expect(parseUsDate("2026-08-05")).toBeUndefined();
    // Date would happily roll this forward into a real (wrong) day.
    expect(parseUsDate("13/45/2026")).toBeUndefined();
    expect(parseUsDate(undefined)).toBeUndefined();
  });
});

describe("dailyBarTime", () => {
  it("anchors a daily bar to UTC midnight of its trade date", () => {
    expect(dailyBarTime("08/05/2026")).toBe(Date.UTC(2026, 7, 5));
    expect(dailyBarTime("N/A")).toBeUndefined();
  });
});

describe("parseHighLowPair", () => {
  it("reads both published orderings by magnitude", () => {
    // Summary: high first, slash-separated. Quote keyStats: low first, dashed.
    expect(parseHighLowPair("$236.54/$164.07")).toEqual({
      high: 236.54,
      low: 164.07,
    });
    expect(parseHighLowPair("164.07 - 236.54")).toEqual({
      high: 236.54,
      low: 164.07,
    });
  });

  it("yields undefined for a closed-session placeholder", () => {
    // "N/A" contains a slash, so it must survive the split path too.
    expect(parseHighLowPair("N/A")).toBeUndefined();
    expect(parseHighLowPair("NA")).toBeUndefined();
    expect(parseHighLowPair(undefined)).toBeUndefined();
  });
});

describe("parseAnalystCount", () => {
  it("pulls the count out of the ratings sentence", () => {
    expect(
      parseAnalystCount(
        "Based on 39 analysts offering recommendations for 'NVDA'.",
      ),
    ).toBe(39);
    expect(
      parseAnalystCount("Based on 1 analyst offering a recommendation."),
    ).toBe(1);
  });

  it("yields undefined when the sentence says nothing countable", () => {
    expect(parseAnalystCount("No analyst coverage.")).toBeUndefined();
    expect(parseAnalystCount(undefined)).toBeUndefined();
  });
});

describe("earningsCalendarTime", () => {
  it("maps the published slugs and refuses to guess at a new one", () => {
    expect(earningsCalendarTime("time-pre-market")).toBe("pre-market");
    expect(earningsCalendarTime("time-after-hours")).toBe("after-hours");
    expect(earningsCalendarTime("time-not-supplied")).toBe("unknown");
    expect(earningsCalendarTime(undefined)).toBe("unknown");
  });
});

describe("tickerOf", () => {
  it("strips a HIP-3 dex prefix and normalises case", () => {
    expect(tickerOf("xyz:NVDA")).toBe("NVDA");
    expect(tickerOf(" nvda ")).toBe("NVDA");
    expect(tickerOf("PBR.A")).toBe("PBR.A");
  });
});

describe("easternDate", () => {
  it("reports the exchange's session date, not the viewer's day", () => {
    // 02:00 UTC on Aug 6 is still Aug 5 in New York — asking for "today" in UTC
    // would fetch tomorrow's empty calendar for a third of every day.
    expect(easternDate(Date.UTC(2026, 7, 6, 2, 0))).toBe("2026-08-05");
    expect(easternDate(Date.UTC(2026, 7, 6, 14, 0))).toBe("2026-08-06");
  });
});

describe("periodKeys", () => {
  it("orders period columns numerically and drops the label column", () => {
    expect(
      periodKeys({
        value1: "Period Ending:",
        value10: "1/2/2017",
        value2: "1/25/2026",
        value3: "1/26/2025",
      }),
    ).toEqual(["value2", "value3", "value10"]);
    expect(periodKeys(undefined)).toEqual([]);
  });
});

describe("parseStatementTable", () => {
  const keys = ["value2", "value3"];
  const table = {
    headers: {
      value1: "Period Ending:",
      value2: "1/25/2026",
      value3: "1/26/2025",
    },
    rows: [
      {
        value1: "Total Revenue",
        value2: "$215,938,000",
        value3: "$130,497,000",
      },
      // Section header: same shape as a data row, distinguishable only by its
      // value cells being empty strings.
      { value1: "Operating Expenses", value2: "", value3: "" },
      { value1: "Income Tax", value2: "$21,383,000", value3: "-$187,000" },
      // A line item that simply didn't print — a real row with real gaps.
      { value1: "Minority Interest", value2: "--", value3: "--" },
    ],
  };

  it("scales statement figures out of thousands", () => {
    const rows = parseStatementTable(table, keys, 1000);
    expect(rows[0]).toEqual({
      label: "Total Revenue",
      values: [215_938_000_000, 130_497_000_000],
    });
    expect(rows[1].values).toEqual([21_383_000_000, -187_000_000]);
  });

  it("drops section headers but keeps a row whose cells are '--'", () => {
    const rows = parseStatementTable(table, keys, 1000);
    expect(rows.map((row) => row.label)).toEqual([
      "Total Revenue",
      "Income Tax",
      "Minority Interest",
    ]);
    // null, never 0 — a zero here draws a real trough where there is only a gap.
    expect(rows[2].values).toEqual([null, null]);
  });

  it("leaves ratio cells unscaled", () => {
    const ratios = parseStatementTable(
      {
        headers: table.headers,
        rows: [
          { value1: "Liquidity Ratios", value2: "", value3: "" },
          { value1: "Gross Margin", value2: "71.06808%", value3: "74.9887%" },
        ],
      },
      keys,
      1,
    );
    expect(ratios).toEqual([
      { label: "Gross Margin", values: [71.06808, 74.9887] },
    ]);
  });

  it("tolerates a missing table", () => {
    expect(parseStatementTable(null, keys, 1000)).toEqual([]);
  });
});
