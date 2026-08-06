import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FredProvider as FredProviderType } from "./index";

// What this file pins, and why it matters:
//
//  1. **The keyless surface.** FRED's *API* needs a registered key; the endpoint
//     this provider reads (`fredgraph.csv?id=…`, what FRED's own charts
//     download) does not. The URL is asserted so nobody "fixes" it into
//     `api.stlouisfed.org`, which would silently take the provider out of the
//     keyless fleet.
//  2. **Multi-series in ONE request.** `id=A,B` returns both columns on a shared
//     date grid, which is how the credit-spread pair is fetched — the two lines
//     are aligned by construction rather than by post-hoc merging. Pinned as a
//     single fetch, and matched by the id FRED echoes in the header rather than
//     by request position.
//  3. **Missing prints are dropped, not zero-filled.** FRED leaves market
//     holidays blank (and "." in legacy exports). A zero would draw a chart
//     crashing to the axis and poison the change calculation.
//  4. **Change units.** For a level the change is a PERCENT; for a rate or
//     spread it is percentage POINTS. A high-yield OAS moving 2.84 → 2.87 is
//     "+3bps"; reporting "+1.06%" states a different quantity entirely, and both
//     render as a plausible small number.
//  5. **UTC date parsing.** A bare `YYYY-MM-DD` read as local time slides every
//     point by up to a day, so `TZ` is pinned to a non-zero offset — the bug is
//     invisible at UTC.
//  6. **Unknown ids fail fast**, before the network, with the known ids named.
//  7. **Transport + caching.** fred.stlouisfed.org sends no CORS header, so the
//     browser path must go through the runtime's same-origin proxy while Node
//     fetches direct; the per-id cache slot dedups concurrent loads and reuses
//     within the TTL.
//  8. **The two doors stay separate.** `macro-reference-series` accepts only the
//     macro-backdrop ids, so a *known* id from the wrong family (`SP500` through
//     the macro door) is refused rather than plotted on an inflation axis. The
//     capability is deliberately NOT the shorter `macro-series` — that name is
//     BLS's, for a period-labelled shape, from a provider earlier in the routing
//     order that would swallow these ids.
//
// `seriesCache` is a module-level singleton, so each test takes a genuinely
// fresh module (and empty cache) via `vi.resetModules()` + a dynamic import.
type Ctor = typeof FredProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.FredProvider;
}

function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function stubCsv(text: string) {
  const fetchMock = vi.fn().mockResolvedValue(textResponse(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const FREDGRAPH = "https://fred.stlouisfed.org/graph/fredgraph.csv";

/** A published single-series file: header, rows, then the trailing newline. */
function csv(id: string, rows: string[]) {
  return [`observation_date,${id}`, ...rows, ""].join("\r\n");
}

// A non-zero UTC offset, so a local-time date parse would visibly shift points.
// Asia/Bangkok is UTC+7 with no DST, which keeps the assertion stable year-round.
// Pinned via `vi.stubEnv` (not `process.env`) so the zone is restored by
// `vi.unstubAllEnvs()` and the file needs no Node types — the same approach the
// OFR provider's UTC-midnight test takes.
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Bangkok");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FredProvider", () => {
  it("advertises the five capabilities it serves, and no others", async () => {
    const Provider = await loadProvider();
    expect([...new Provider().capabilities].sort()).toEqual([
      "credit-spread",
      "housing-price",
      "index-level",
      "macro-reference-series",
      "mortgage-rate",
    ]);
  });

  describe("index levels", () => {
    it("reads the keyless fredgraph CSV endpoint for the requested id", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv("SP500", ["2026-07-30,7437.63", "2026-07-31,7489.72"]),
      );
      const series = await new Provider().getIndexSeries("SP500");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The keyless surface: no key parameter, and NOT the keyed api host.
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=SP500`);
      expect(series.seriesId).toBe("SP500");
      expect(series.label).toBe("S&P 500");
      expect(series.unit).toBe("index");
      expect(series.frequency).toBe("daily");
      expect(series.latest).toBe(7489.72);
      expect(series.date).toBe("2026-07-31");
      expect(series.source).toBe("FRED");
    });

    it("times each point at UTC midnight, not local midnight", async () => {
      const Provider = await loadProvider();
      // Self-check: if TZ pinning ever stops taking effect the assertion below
      // decays into a tautology (at UTC both parses agree), so fail loudly here.
      expect(new Date(Date.UTC(2026, 6, 31)).getTimezoneOffset()).not.toBe(0);
      stubCsv(csv("SP500", ["2026-07-31,7489.72"]));
      const series = await new Provider().getIndexSeries("SP500");
      // At UTC+7 a local parse would land 7h earlier — on the 30th in UTC terms.
      expect(series.points[0].time).toBe(Date.UTC(2026, 6, 31));
    });

    it("drops blank and '.' observations instead of zero-filling them", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv("SP500", [
          "2026-07-28,7400.00",
          "2026-07-29,", // market holiday: blank in the CSV download
          "2026-07-30,.", // the legacy export's marker for the same thing
          "2026-07-31,7489.72",
        ]),
      );
      const series = await new Provider().getIndexSeries("SP500");
      expect(series.points.map((p) => p.value)).toEqual([7400, 7489.72]);
      // And the change is measured against the last REAL print, not a zero.
      expect(series.change).toBeCloseTo(((7489.72 - 7400) / 7400) * 100, 6);
    });

    it("reports a level's change as a percent", async () => {
      const Provider = await loadProvider();
      stubCsv(csv("NASDAQCOM", ["2026-07-30,25000.00", "2026-07-31,25250.00"]));
      const series = await new Provider().getIndexSeries("NASDAQCOM");
      expect(series.change).toBeCloseTo(1, 6);
    });

    it("rejects an unknown series id before touching the network", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("SP500", ["2026-07-31,1"]));
      await expect(new Provider().getIndexSeries("NOTASERIES")).rejects.toThrow(
        /unknown series "NOTASERIES"/,
      );
      // The known ids are named in the message, so the fix is obvious.
      await expect(new Provider().getIndexSeries("NOTASERIES")).rejects.toThrow(
        /SP500/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts a lower-case id (the ids are conventionally upper-case)", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("VIXCLS", ["2026-07-30,17.09"]));
      const series = await new Provider().getIndexSeries("vixcls");
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=VIXCLS`);
      expect(series.seriesId).toBe("VIXCLS");
    });

    it("throws on a header that isn't a fredgraph CSV", async () => {
      const Provider = await loadProvider();
      // An HTML error page or a renamed column must fail loudly here rather
      // than parse to an empty series that renders as "no data yet".
      stubCsv("<!DOCTYPE html><html><head><title>Error</title></head></html>");
      await expect(new Provider().getIndexSeries("SP500")).rejects.toThrow(
        /unexpected CSV header/,
      );
    });

    it("throws when a column carries no usable observation", async () => {
      const Provider = await loadProvider();
      stubCsv(csv("SP500", ["2026-07-30,", "2026-07-31,."]));
      await expect(new Provider().getIndexSeries("SP500")).rejects.toThrow(
        /no observations/,
      );
    });
  });

  describe("credit spreads", () => {
    it("fetches BOTH series in one request, on a shared date grid", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        [
          "observation_date,BAMLH0A0HYM2,BAMLC0A0CM",
          "2026-07-29,2.87,0.81",
          "2026-07-30,2.84,0.80",
          "",
        ].join("\r\n"),
      );
      const spreads = await new Provider().getCreditSpreads();

      // One request, not two — that's what makes the grids identical rather
      // than merely similar.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${FREDGRAPH}?id=${encodeURIComponent("BAMLH0A0HYM2,BAMLC0A0CM")}`,
      );
      expect(spreads.map((s) => s.seriesId)).toEqual([
        "BAMLH0A0HYM2",
        "BAMLC0A0CM",
      ]);
      expect(spreads[0].points.map((p) => p.time)).toEqual(
        spreads[1].points.map((p) => p.time),
      );
    });

    it("reports a spread's change in percentage POINTS, not percent", async () => {
      const Provider = await loadProvider();
      stubCsv(
        [
          "observation_date,BAMLH0A0HYM2,BAMLC0A0CM",
          "2026-07-29,2.87,0.81",
          "2026-07-30,2.84,0.80",
          "",
        ].join("\r\n"),
      );
      const [hy, ig] = await new Provider().getCreditSpreads();
      expect(hy.unit).toBe("percent");
      // 2.87 → 2.84 is −3bps = −0.03 points, NOT −1.05%.
      expect(hy.change).toBeCloseTo(-0.03, 6);
      expect(ig.change).toBeCloseTo(-0.01, 6);
    });

    it("labels each column by the id FRED echoed, not by request position", async () => {
      const Provider = await loadProvider();
      // Upstream answers with the columns the other way round.
      stubCsv(
        [
          "observation_date,BAMLC0A0CM,BAMLH0A0HYM2",
          "2026-07-30,0.80,2.84",
          "",
        ].join("\r\n"),
      );
      const spreads = await new Provider().getCreditSpreads();
      const byId = new Map(spreads.map((s) => [s.seriesId, s.latest]));
      // Position-based labelling would swap an investment-grade spread onto the
      // high-yield line — a 3.5× error that still looks like a spread.
      expect(byId.get("BAMLH0A0HYM2")).toBe(2.84);
      expect(byId.get("BAMLC0A0CM")).toBe(0.8);
    });

    it("skips a blank cell in one column without dropping the other's print", async () => {
      const Provider = await loadProvider();
      stubCsv(
        [
          "observation_date,BAMLH0A0HYM2,BAMLC0A0CM",
          "2026-07-29,2.87,0.81",
          "2026-07-30,2.84,", // IG has no print that day
          "",
        ].join("\r\n"),
      );
      const [hy, ig] = await new Provider().getCreditSpreads();
      expect(hy.points).toHaveLength(2);
      expect(ig.points).toHaveLength(1);
    });
  });

  describe("housing and mortgage series", () => {
    it("reads the Case-Shiller national index as a monthly level", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv("CSUSHPINSA", ["2026-04-01,332.984", "2026-05-01,335.104"]),
      );
      const series = await new Provider().getHousingPriceIndex();
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=CSUSHPINSA`);
      expect(series.unit).toBe("index");
      expect(series.frequency).toBe("monthly");
      expect(series.latest).toBe(335.104);
    });

    it("reads the 30-year mortgage rate as a weekly percent", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv("MORTGAGE30US", ["2026-07-23,6.58", "2026-07-30,6.66"]),
      );
      const series = await new Provider().getMortgageRates();
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=MORTGAGE30US`);
      expect(series.unit).toBe("percent");
      expect(series.frequency).toBe("weekly");
      // +8bps week over week, in points.
      expect(series.change).toBeCloseTo(0.08, 6);
    });
  });

  describe("macro reference series", () => {
    // The point of this capability: a commodity has no earnings, so a real
    // (inflation-adjusted) price is how "is gold expensive" gets answered. That
    // needs CPI back to 1947 in one piece — which is why it comes from FRED and
    // not from provider-bls, whose keyless tier caps a request at 10 years and
    // keeps the FIRST ten (a 1968→2026 request answers 1968–1977 and still
    // reports REQUEST_SUCCEEDED).
    it("reads CPI as a monthly index, with a percent change", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv("CPIAUCSL", ["2026-05-01,333.979", "2026-06-01,332.568"]),
      );
      const series = await new Provider().getMacroReferenceSeries("CPIAUCSL");
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=CPIAUCSL`);
      expect(series.label).toBe("CPI (All Urban Consumers, SA)");
      expect(series.unit).toBe("index");
      expect(series.frequency).toBe("monthly");
      expect(series.latest).toBe(332.568);
      expect(series.date).toBe("2026-06-01");
      // A level, so the move is a percent — and it can be negative.
      expect(series.change).toBeCloseTo(
        ((332.568 - 333.979) / 333.979) * 100,
        6,
      );
    });

    it("reports a real yield's change in percentage POINTS, not percent", async () => {
      const Provider = await loadProvider();
      // The live prints on 2026-08-03 → 2026-08-04.
      stubCsv(csv("DFII10", ["2026-08-03,2.43", "2026-08-04,2.40"]));
      const series = await new Provider().getMacroReferenceSeries("DFII10");
      expect(series.unit).toBe("percent");
      // 2.43 → 2.40 is −3bps = −0.03 points. As a percent it would read −1.23%,
      // a different quantity that renders as an equally plausible small number.
      expect(series.change).toBeCloseTo(-0.03, 6);
    });

    it("treats the dollar index as a level and the breakeven as a rate", async () => {
      const Provider = await loadProvider();
      stubCsv(csv("DTWEXBGS", ["2026-07-30,119.6753", "2026-07-31,119.7034"]));
      const dollar = await new Provider().getMacroReferenceSeries("DTWEXBGS");
      expect(dollar.unit).toBe("index");
      expect(dollar.change).toBeCloseTo(
        ((119.7034 - 119.6753) / 119.6753) * 100,
        6,
      );

      const Fresh = await loadProvider();
      stubCsv(csv("T10YIE", ["2026-08-04,2.23", "2026-08-05,2.22"]));
      const breakeven = await new Fresh().getMacroReferenceSeries("T10YIE");
      expect(breakeven.unit).toBe("percent");
      expect(breakeven.change).toBeCloseTo(-0.01, 6);
    });

    it("serves the monthly real rate that reaches deeper than TIPS", async () => {
      const Provider = await loadProvider();
      // REAINTRATREARAT10Y starts 1982; DFII10 only starts 2003, when TIPS
      // began trading. A long real-yield-vs-gold overlay needs the former.
      const fetchMock = stubCsv(
        csv("REAINTRATREARAT10Y", [
          "1982-01-01,7.62374231",
          "2026-07-01,2.07685732",
        ]),
      );
      const series = await new Provider().getMacroReferenceSeries(
        "REAINTRATREARAT10Y",
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${FREDGRAPH}?id=REAINTRATREARAT10Y`,
      );
      expect(series.frequency).toBe("monthly");
      expect(series.points[0].time).toBe(Date.UTC(1982, 0, 1));
    });

    it("refuses a known-but-non-macro id, before touching the network", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("SP500", ["2026-07-31,7489.72"]));
      // SP500 is a series this provider publishes — just not through THIS door.
      // Letting it through would plot an equity index on an inflation axis,
      // which reads as data rather than as a mistake.
      await expect(
        new Provider().getMacroReferenceSeries("SP500"),
      ).rejects.toThrow(/not a macro reference series/);
      // The accepted ids are named, so the fix is obvious from the message.
      await expect(
        new Provider().getMacroReferenceSeries("SP500"),
      ).rejects.toThrow(/CPIAUCSL/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still rejects an id the provider doesn't publish at all", async () => {
      const Provider = await loadProvider();
      await expect(
        new Provider().getMacroReferenceSeries("NOTASERIES"),
      ).rejects.toThrow(/unknown series "NOTASERIES"/);
    });

    it("accepts a lower-case macro id, like every other id here", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("CPIAUCSL", ["2026-06-01,332.568"]));
      const series = await new Provider().getMacroReferenceSeries("cpiaucsl");
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=CPIAUCSL`);
      expect(series.seriesId).toBe("CPIAUCSL");
    });

    it("shares one download between two cards on the same macro series", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("CPIAUCSL", ["2026-06-01,332.568"]));
      const provider = new Provider();
      // A board carrying a real-gold-price card and a CPI card must not
      // download the 1947-deep series twice.
      await Promise.all([
        provider.getMacroReferenceSeries("CPIAUCSL"),
        provider.getMacroReferenceSeries("CPIAUCSL"),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("transport and caching", () => {
    it("fetches direct in Node (no proxy hop)", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("SP500", ["2026-07-31,7489.72"]));
      await new Provider().getIndexSeries("SP500");
      expect(fetchMock.mock.calls[0][0]).toBe(`${FREDGRAPH}?id=SP500`);
    });

    it("routes through the same-origin proxy in the browser", async () => {
      const Provider = await loadProvider();
      // fred.stlouisfed.org sends no Access-Control-Allow-Origin, so the browser
      // path MUST take the relay or every FRED frame is permanently empty.
      vi.stubGlobal("document", {});
      const fetchMock = stubCsv(csv("SP500", ["2026-07-31,7489.72"]));
      await new Provider().getIndexSeries("SP500");
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/__zframes/proxy?url=${encodeURIComponent(`${FREDGRAPH}?id=SP500`)}`,
      );
    });

    it("coalesces concurrent loads of one series onto a single request", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("SP500", ["2026-07-31,7489.72"]));
      const provider = new Provider();
      const [a, b] = await Promise.all([
        provider.getIndexSeries("SP500"),
        provider.getIndexSeries("SP500"),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a.latest).toBe(b.latest);
    });

    it("reuses a cached series within the TTL, across provider instances", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv("SP500", ["2026-07-31,7489.72"]));
      await new Provider().getIndexSeries("SP500");
      // A second card on the same series must not spend another request.
      await new Provider().getIndexSeries("SP500");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("caches per series id, so a different id still fetches", async () => {
      const Provider = await loadProvider();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          textResponse(csv("SP500", ["2026-07-31,7489.72"])),
        )
        .mockResolvedValueOnce(
          textResponse(csv("VIXCLS", ["2026-07-30,17.09"])),
        );
      vi.stubGlobal("fetch", fetchMock);
      const provider = new Provider();
      expect((await provider.getIndexSeries("SP500")).latest).toBe(7489.72);
      expect((await provider.getIndexSeries("VIXCLS")).latest).toBe(17.09);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("surfaces an upstream failure rather than an empty series", async () => {
      const Provider = await loadProvider();
      // A bad id 404s upstream (confirmed live), and the transport labels it.
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", 404)));
      await expect(new Provider().getIndexSeries("SP500")).rejects.toThrow(
        /404/,
      );
    });
  });
});
