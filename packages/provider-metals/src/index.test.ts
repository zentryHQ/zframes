import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetalsProvider as MetalsProviderType } from "./index";

// Every cache in the provider is a module-level singleton (and `lastFix` is a
// module-level Map), so each test gets a fresh module — otherwise a primed
// history would leak a change% into a later "no history yet" assertion.
type Ctor = typeof MetalsProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.MetalsProvider;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** The Cboe histories are CSV, so they come back as text rather than JSON. */
function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

function quote(symbol: string, name: string, price: number) {
  return {
    currency: "USD",
    name,
    price,
    symbol,
    updatedAt: "2026-07-24T20:00:00Z",
  };
}

/** LBMA rows: `v` is [USD, GBP, EUR]; pre-euro rows carry a null EUR. */
const LBMA_GOLD = [
  { is_cms_locked: 0, d: "2026-07-22", v: [4000, 3000, 3400] },
  { is_cms_locked: 0, d: "2026-07-21", v: [3900, 2900, 3300] },
  { is_cms_locked: 0, d: "1968-04-01", v: [37.7, 15.68, null] },
  { is_cms_locked: 0, d: "2026-07-23", v: [null, 3100, 3500] },
];

const COT_ROWS = [
  {
    report_date_as_yyyy_mm_dd: "2026-07-21T00:00:00.000",
    open_interest_all: "383368",
    noncomm_positions_long_all: "224785",
    noncomm_positions_short_all: "40875",
    noncomm_postions_spread_all: "31983",
    comm_positions_long_all: "80457",
    comm_positions_short_all: "293656",
    nonrept_positions_long_all: "46143",
    nonrept_positions_short_all: "16854",
  },
  {
    report_date_as_yyyy_mm_dd: "2026-07-14T00:00:00.000",
    open_interest_all: "383689",
    noncomm_positions_long_all: "227310",
    noncomm_positions_short_all: "40628",
    noncomm_postions_spread_all: "32321",
    comm_positions_long_all: "79639",
    comm_positions_short_all: "294427",
    nonrept_positions_long_all: "44419",
    nonrept_positions_short_all: "16313",
  },
];

/**
 * Two disaggregated weeks matching the legacy dates above, plus one that doesn't,
 * with the real published gold figures for 2026-07-28. Column names are verbatim
 * CFTC — note `swap_positions_long_all` (one underscore) beside
 * `swap__positions_short_all` and `swap__positions_spread_all` (two).
 */
const DISAGG_ROWS = [
  {
    report_date_as_yyyy_mm_dd: "2026-07-21T00:00:00.000",
    prod_merc_positions_long: "15367",
    prod_merc_positions_short: "35916",
    swap_positions_long_all: "23661",
    swap__positions_short_all: "215421",
    swap__positions_spread_all: "36432",
    m_money_positions_long_all: "135093",
    m_money_positions_short_all: "15298",
    m_money_positions_spread: "18384",
    other_rept_positions_long: "84529",
    other_rept_positions_short: "22254",
    other_rept_positions_spread: "9753",
    nonrept_positions_long_all: "61384",
    nonrept_positions_short_all: "31145",
    change_in_swap_short_all: "-3416",
    change_in_m_money_long_all: "-6394",
    pct_of_oi_swap_short_all: "56.0",
    pct_of_oi_m_money_long_all: "35.1",
    traders_tot_all: "256",
    traders_m_money_long_all: "72",
    traders_other_rept_short: "31",
    conc_gross_le_4_tdr_long: "21.7",
    conc_gross_le_4_tdr_short: "35.5",
    conc_gross_le_8_tdr_long: "31.2",
    conc_gross_le_8_tdr_short: "53.8",
    conc_net_le_8_tdr_short_all: "49.9",
    contract_units: "(CONTRACTS OF 100 TROY OUNCES)",
  },
  {
    report_date_as_yyyy_mm_dd: "2026-07-14T00:00:00.000",
    prod_merc_positions_long: "15561",
    prod_merc_positions_short: "34882",
    swap_positions_long_all: "24959",
    swap__positions_short_all: "218837",
    swap__positions_spread_all: "39937",
    m_money_positions_long_all: "141487",
    m_money_positions_short_all: "16656",
    m_money_positions_spread: "17872",
    other_rept_positions_long: "83298",
    other_rept_positions_short: "24219",
    other_rept_positions_spread: "14111",
    nonrept_positions_long_all: "46143",
    nonrept_positions_short_all: "16854",
  },
  {
    // A week the legacy window doesn't cover: it must be dropped, not invent a week.
    report_date_as_yyyy_mm_dd: "2026-07-07T00:00:00.000",
    prod_merc_positions_long: "1",
    prod_merc_positions_short: "2",
    swap_positions_long_all: "3",
    swap__positions_short_all: "4",
    m_money_positions_long_all: "5",
    m_money_positions_short_all: "6",
    other_rept_positions_long: "7",
    other_rept_positions_short: "8",
    nonrept_positions_long_all: "9",
    nonrept_positions_short_all: "10",
  },
];

/** GVZ/OVX shape: close-only, the value column named after the index. */
const GVZ_CSV = [
  "DATE,GVZ",
  "07/31/2026,24.100000",
  // A non-calculating session and a malformed date: one row each, not the file.
  "08/01/2026,0.000000",
  "not-a-date,99.000000",
  "08/03/2026,23.650000",
  "08/05/2026,25.590000",
  "",
].join("\n");

/** VXSLV/VXGDX shape: OHLC, so column 1 is the OPEN and only CLOSE is the close. */
const VXSLV_CSV = [
  "DATE,OPEN,HIGH,LOW,CLOSE",
  "08/04/2026,47.260000,47.810000,46.380000,47.440000",
  "08/05/2026,49.260000,49.860000,47.900000,48.020000",
].join("\r\n");

const RESERVE_ROWS = {
  data: [
    {
      record_date: "2026-06-30",
      facility_desc: "Mint Held Gold - Deep Storage",
      form_desc: "Gold Bullion",
      location_desc: "Fort Knox, KY",
      fine_troy_ounce_qty: "147341858.382",
      book_value_amt: "6221097412.78",
    },
    {
      record_date: "2026-06-30",
      facility_desc: "Federal Reserve Bank Held Gold",
      form_desc: "Gold Bullion",
      location_desc: "Federal Reserve Banks - NY Vault",
      fine_troy_ounce_qty: "13376987.724",
      book_value_amt: "564805851.07",
    },
    {
      // An older month in the same page must not leak into the latest report.
      record_date: "2026-05-31",
      facility_desc: "Mint Held Gold - Deep Storage",
      form_desc: "Gold Bullion",
      location_desc: "Fort Knox, KY",
      fine_troy_ounce_qty: "147341858.382",
      book_value_amt: "6221097412.78",
    },
  ],
};

const TOKEN_ROWS = [
  {
    id: "pax-gold",
    symbol: "paxg",
    name: "PAX Gold",
    current_price: 4040,
    price_change_percentage_24h: 0.1,
    market_cap: 1_800_000_000,
    total_volume: 90_000_000,
    circulating_supply: 444_865,
  },
  {
    id: "tether-gold",
    symbol: "xaut",
    name: "Tether Gold",
    current_price: 4060,
    price_change_percentage_24h: 0.2,
    market_cap: 2_480_000_000,
    total_volume: 146_000_000,
    circulating_supply: 612_823,
  },
];

/** Route by URL fragment; anything unrouted 500s so a stray call is loud. */
function routedFetch(routes: Array<[string, unknown]>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [fragment, body] of routes) {
      if (url.includes(fragment)) return Promise.resolve(jsonResponse(body));
    }
    return Promise.resolve(jsonResponse(null, 500));
  });
}

describe("MetalsProvider", () => {
  let MetalsProvider: Ctor;

  beforeEach(async () => {
    MetalsProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new MetalsProvider();
    expect(provider.name).toBe("metals");
    expect(provider.capabilities).toEqual([
      "metal-spot",
      "metal-history",
      "metal-positioning",
      "gold-reserve",
      "tokenized-gold",
      "commodity-vol-index",
    ]);
  });

  describe("getMetalSpot", () => {
    it("returns a quote per requested metal and skips a failing one", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/price/XAU"))
            return Promise.resolve(jsonResponse(quote("XAU", "Gold", 4055.3)));
          if (url.includes("/price/XAG"))
            return Promise.resolve(jsonResponse(null, 503));
          return Promise.resolve(jsonResponse(null, 500));
        }),
      );
      const metals = await new MetalsProvider().getMetalSpot(["XAU", "XAG"]);
      expect(metals).toHaveLength(1);
      expect(metals[0]).toMatchObject({
        symbol: "XAU",
        name: "Gold",
        price: 4055.3,
      });
      // No fix history primed yet: the quote is returned bare rather than
      // blocking on the multi-hundred-KB LBMA download.
      expect(metals[0].changePct).toBeUndefined();
    });

    it("ignores unknown symbols and defaults to the full universe", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation((url: string) =>
            Promise.resolve(
              jsonResponse(quote(url.split("/").pop() ?? "XAU", "Metal", 100)),
            ),
          ),
      );
      const provider = new MetalsProvider();
      // A symbol the provider doesn't cover is dropped, not guessed at.
      expect(await provider.getMetalSpot(["DOGE"])).toEqual([]);
      expect((await provider.getMetalSpot()).map((m) => m.symbol)).toEqual([
        "XAU",
        "XAG",
        "XPT",
        "XPD",
        "HG",
      ]);
    });

    it("attaches change vs the latest London fix once history is cached", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          ["/price/XAU", quote("XAU", "Gold", 4040)],
          ["gold_pm.json", LBMA_GOLD],
        ]),
      );
      const provider = new MetalsProvider();
      // Priming the shared history cache is what publishes the fix.
      await provider.getMetalHistory(["XAU"]);
      const [gold] = await provider.getMetalSpot(["XAU"]);
      expect(gold.prevFix).toBe(4000);
      expect(gold.changePct).toBeCloseTo(1, 6);
    });
  });

  describe("getMetalHistory", () => {
    it("parses, filters and sorts the LBMA fix file", async () => {
      vi.stubGlobal("fetch", routedFetch([["gold_pm.json", LBMA_GOLD]]));
      const [history] = await new MetalsProvider().getMetalHistory(["XAU"]);
      expect(history.symbol).toBe("XAU");
      expect(history.currency).toBe("USD");
      // The null-USD row is dropped; the rest are ascending by date.
      expect(history.points.map((p) => p.value)).toEqual([37.7, 3900, 4000]);
      expect(history.points[0].time).toBe(Date.parse("1968-04-01T00:00:00Z"));
    });

    it("reads the requested currency column and falls back to USD", async () => {
      vi.stubGlobal("fetch", routedFetch([["gold_pm.json", LBMA_GOLD]]));
      const provider = new MetalsProvider();
      const [eur] = await provider.getMetalHistory(["XAU"], "EUR");
      // The 1968 row has a null EUR column and drops out; the row whose USD
      // column is null is fine here, because its EUR column isn't.
      expect(eur.points.map((p) => p.value)).toEqual([3300, 3400, 3500]);
      const [fallback] = await provider.getMetalHistory(["XAU"], "JPY");
      expect(fallback.currency).toBe("USD");
    });

    it("drops metals with no published LBMA fix instead of failing", async () => {
      vi.stubGlobal("fetch", routedFetch([["gold_pm.json", LBMA_GOLD]]));
      const histories = await new MetalsProvider().getMetalHistory([
        "XAU",
        "HG",
      ]);
      expect(histories.map((h) => h.symbol)).toEqual(["XAU"]);
    });
  });

  describe("getMetalPositioning", () => {
    it("parses the legacy COT report oldest-first", async () => {
      const fetchMock = routedFetch([["publicreporting.cftc.gov", COT_ROWS]]);
      vi.stubGlobal("fetch", fetchMock);
      const cot = await new MetalsProvider().getMetalPositioning("XAU");
      expect(fetchMock.mock.calls[0][0]).toContain(
        "cftc_contract_market_code=088691",
      );
      expect(cot.market).toBe("GOLD - COMMODITY EXCHANGE INC.");
      expect(cot.contractSize).toBe(100);
      expect(cot.weeks.map((w) => w.openInterest)).toEqual([383689, 383368]);
      // CFTC's own field name carries a typo ("postions"); read it verbatim.
      expect(cot.weeks[1].noncommercialSpread).toBe(31983);
      expect(cot.weeks[1].commercialShort).toBe(293656);
    });

    it("falls back to gold for an unrecognised symbol", async () => {
      const fetchMock = routedFetch([["publicreporting.cftc.gov", COT_ROWS]]);
      vi.stubGlobal("fetch", fetchMock);
      const cot = await new MetalsProvider().getMetalPositioning("DOGE");
      expect(cot.symbol).toBe("XAU");
    });

    it("throws when the report has no usable rows", async () => {
      vi.stubGlobal("fetch", routedFetch([["publicreporting.cftc.gov", []]]));
      await expect(
        new MetalsProvider().getMetalPositioning("XAG"),
      ).rejects.toThrow(/no usable rows/);
    });

    it("merges the disaggregated report onto the weeks it covers", async () => {
      const fetchMock = routedFetch([
        // Both datasets live on publicreporting.cftc.gov, so route on the
        // dataset id — the disaggregated one must be matched first.
        ["72hh-3qpy", DISAGG_ROWS],
        ["6dca-aqww", COT_ROWS],
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const cot = await new MetalsProvider().getMetalPositioning("XAU");

      // The disaggregated week with no legacy counterpart is dropped rather than
      // inventing a week the legacy report never published.
      expect(cot.weeks).toHaveLength(2);
      // Legacy fields are untouched by the merge — five shipped frames read them.
      expect(cot.contractSize).toBe(100);
      expect(cot.weeks[1].openInterest).toBe(383368);
      expect(cot.weeks[1].commercialShort).toBe(293656);

      const newest = cot.weeks[1].disaggregated;
      // The two double-underscore columns: a single-underscore read would land
      // here as 0, which is exactly what this asserts against.
      expect(newest?.swapDealer.short).toBe(215421);
      expect(newest?.swapDealer.spread).toBe(36432);
      expect(newest?.swapDealer.long).toBe(23661);
      // The legacy report's single `commercial` bucket split in two.
      expect(newest?.producerMerchant.short).toBe(35916);
      expect(newest?.managedMoney).toMatchObject({
        long: 135093,
        short: 15298,
        spread: 18384,
        changeLong: -6394,
        pctOfOiLong: 35.1,
        tradersLong: 72,
      });
      // `traders_other_rept_short` drops the `_all` its long sibling carries.
      expect(newest?.otherReportable.tradersShort).toBe(31);
      expect(newest?.totalTraders).toBe(256);
      expect(newest?.concentration).toMatchObject({
        grossShort4: 35.5,
        grossShort8: 53.8,
        netShort8: 49.9,
      });
      // Published units are surfaced alongside — never instead of — contractSize.
      expect(newest?.contractUnits).toBe("(CONTRACTS OF 100 TROY OUNCES)");

      // Absent optional columns stay undefined rather than reading as zero: the
      // older week publishes no changes, and neither class here ever spreads.
      const older = cot.weeks[0].disaggregated;
      expect(older?.managedMoney.changeLong).toBeUndefined();
      expect(older?.concentration).toBeUndefined();
      expect(older?.producerMerchant.spread).toBeUndefined();
      expect(older?.nonReportable.spread).toBeUndefined();
      expect(older?.nonReportable.long).toBe(46143);
    });

    it("still returns the legacy weeks when the disaggregated report fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("72hh-3qpy"))
            return Promise.resolve(jsonResponse(null, 503));
          if (url.includes("6dca-aqww"))
            return Promise.resolve(jsonResponse(COT_ROWS));
          return Promise.resolve(jsonResponse(null, 500));
        }),
      );
      const cot = await new MetalsProvider().getMetalPositioning("XAU");
      // The whole point of the field being optional: an enrichment outage costs
      // the extra classes, not the board.
      expect(cot.weeks).toHaveLength(2);
      expect(cot.weeks[1].openInterest).toBe(383368);
      expect(cot.weeks[1].disaggregated).toBeUndefined();
    });

    it("ignores rows that carry no disaggregated columns", async () => {
      // The two datasets share several column names outright, so a legacy-shaped
      // row must not map into a week of zeros that looks published.
      vi.stubGlobal(
        "fetch",
        routedFetch([["publicreporting.cftc.gov", COT_ROWS]]),
      );
      const cot = await new MetalsProvider().getMetalPositioning("XAU");
      expect(cot.weeks.every((w) => w.disaggregated === undefined)).toBe(true);
    });
  });

  describe("getCommodityVolIndex", () => {
    function csvFetch(routes: Array<[string, string]>) {
      return vi.fn().mockImplementation((url: string) => {
        for (const [fragment, body] of routes) {
          if (url.includes(fragment))
            return Promise.resolve(textResponse(body));
        }
        return Promise.resolve(jsonResponse(null, 500));
      });
    }

    it("reads a close-only file, dropping unusable rows", async () => {
      vi.stubGlobal("fetch", csvFetch([["GVZ_History.csv", GVZ_CSV]]));
      const series = await new MetalsProvider().getCommodityVolIndex("GVZ");
      expect(series).toMatchObject({
        seriesId: "GVZ",
        label: "Gold ETF Volatility",
        // An `index`, matching how the fleet already serves the VIX, so a
        // metals-vol card and an equity-vol card denominate `change` alike.
        unit: "index",
        frequency: "daily",
        latest: 25.59,
        date: "2026-08-05",
        source: "Cboe",
      });
      // The zero print and the malformed date cost one row each, not the file.
      expect(series.points.map((p) => p.value)).toEqual([24.1, 23.65, 25.59]);
      // Dates parse to UTC midnight, so the epoch doesn't shift with the viewer.
      expect(series.points[0].time).toBe(Date.parse("2026-07-31T00:00:00Z"));
      expect(series.change).toBeCloseTo(((25.59 - 23.65) / 23.65) * 100, 6);
    });

    it("reads CLOSE from an OHLC file, not the OPEN in column 1", async () => {
      vi.stubGlobal("fetch", csvFetch([["VXSLV_History.csv", VXSLV_CSV]]));
      const series = await new MetalsProvider().getCommodityVolIndex("vxslv");
      // 49.26 is that day's OPEN; a positional parser would publish it as the
      // close and the series would look plausible while being the wrong number.
      expect(series.latest).toBe(48.02);
      expect(series.points.map((p) => p.value)).toEqual([47.44, 48.02]);
      expect(series.seriesId).toBe("VXSLV");
    });

    it("caches per index id and reuses one download", async () => {
      const fetchMock = csvFetch([
        ["GVZ_History.csv", GVZ_CSV],
        ["VXSLV_History.csv", VXSLV_CSV],
      ]);
      vi.stubGlobal("fetch", fetchMock);
      const provider = new MetalsProvider();
      await provider.getCommodityVolIndex("GVZ");
      await provider.getCommodityVolIndex("GVZ");
      await provider.getCommodityVolIndex("VXSLV");
      // One request per index, not per call: the key is the index id.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("rejects an index it doesn't publish, before fetching", async () => {
      const fetchMock = csvFetch([]);
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        new MetalsProvider().getCommodityVolIndex("VIX"),
      ).rejects.toThrow(/unknown volatility index "VIX".*GVZ/s);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws when the header carries no locatable close column", async () => {
      vi.stubGlobal(
        "fetch",
        csvFetch([["OVX_History.csv", "DATE,SOMETHING\n08/05/2026,10.0"]]),
      );
      await expect(
        new MetalsProvider().getCommodityVolIndex("OVX"),
      ).rejects.toThrow(/no close column/);
    });
  });

  describe("getGoldReserve", () => {
    it("keeps only the newest report date and totals it", async () => {
      const fetchMock = routedFetch([["gold_reserve", RESERVE_ROWS]]);
      vi.stubGlobal("fetch", fetchMock);
      const reserve = await new MetalsProvider().getGoldReserve();
      expect(reserve.asOf).toBe(Date.parse("2026-06-30T00:00:00Z"));
      expect(reserve.entries).toHaveLength(2);
      expect(reserve.totalOunces).toBeCloseTo(160_718_846.106, 3);
      expect(reserve.totalBookValueUsd).toBeCloseTo(6_785_903_263.85, 2);
      // Descending by ounces, so the biggest vault leads the list.
      expect(reserve.entries[0].location).toBe("Fort Knox, KY");
    });
  });

  describe("getTokenizedGold", () => {
    it("sorts by market cap and prices the premium off live spot", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          ["coins/markets", TOKEN_ROWS],
          ["/price/XAU", quote("XAU", "Gold", 4000)],
        ]),
      );
      const tokens = await new MetalsProvider().getTokenizedGold();
      expect(tokens.map((t) => t.symbol)).toEqual(["XAUT", "PAXG"]);
      expect(tokens[0].premiumPct).toBeCloseTo(1.5, 6);
      expect(tokens[1].premiumPct).toBeCloseTo(1, 6);
    });

    it("still returns tokens when spot is unavailable", async () => {
      vi.stubGlobal("fetch", routedFetch([["coins/markets", TOKEN_ROWS]]));
      const tokens = await new MetalsProvider().getTokenizedGold();
      expect(tokens).toHaveLength(2);
      expect(tokens[0].premiumPct).toBeUndefined();
    });
  });
});
