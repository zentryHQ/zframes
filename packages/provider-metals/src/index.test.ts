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
