import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeribitProvider as DeribitProviderType } from "./index";

// The book / summary / chain caches are module-level singletons, so each test
// takes a fresh module — otherwise a primed BTC book would make the next test's
// "one fetch" assertion pass for the wrong reason.
async function loadProvider(): Promise<typeof DeribitProviderType> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.DeribitProvider;
}

interface RowOverrides {
  mark_iv?: number;
  open_interest?: number;
  volume?: number;
  bid_price?: number | null;
  ask_price?: number | null;
  last?: number | null;
}

const BTC_INDEX = 60_000;

function row(name: string, index: number, over: RowOverrides = {}) {
  return {
    instrument_name: name,
    base_currency: name.split(/[-_]/)[0],
    open_interest: over.open_interest ?? 1,
    volume: over.volume ?? 0,
    mark_iv: over.mark_iv ?? 50,
    // The forward differs from the index; the mapping must use the index, so the
    // two are deliberately far apart here.
    underlying_price: index * 1.05,
    estimated_delivery_price: index,
    // `in`, not `??` — an explicitly null quote is the case under test, and a
    // nullish fallback would quietly replace it with a live price.
    bid_price: "bid_price" in over ? over.bid_price! : 0.01,
    ask_price: "ask_price" in over ? over.ask_price! : 0.02,
    last: "last" in over ? over.last! : 0.015,
  };
}

// Inverse (coin-margined) rows: premiums in BTC, mark IV in percent. Ordered
// worst-first on purpose — latest expiry leading, put before call at one strike —
// so the ordering assertion tests the sort and not the fixture.
const BTC_BOOK = [
  row("BTC-26SEP26-70000-P", BTC_INDEX, { mark_iv: 55.5, last: null }),
  row("BTC-7AUG26-60000-P", BTC_INDEX, { mark_iv: 42 }),
  row("BTC-7AUG26-60000-C", BTC_INDEX, {
    mark_iv: 42,
    open_interest: 156.6,
    volume: 102,
    bid_price: 0.005,
  }),
  row("BTC-7AUG26-58000-C", BTC_INDEX, { bid_price: null }),
];

// One combined USDC book holds every linear underlying, so a SOL chain is this
// filtered by base currency. TRX carries the `d`-for-decimal-point strike names.
const USDC_BOOK = [
  row("SOL_USDC-25SEP26-116-P", 73.31, { bid_price: 1.5, ask_price: 2.5 }),
  row("TRX_USDC-28AUG26-0d41-C", 0.327),
  row("XRP_USDC-7AUG26-1d25-P", 1.04),
];

// DVOL: [ts, open, high, low, close] — annualised IV in PERCENT, so the close
// here is what the chain must divide by 100.
const DVOL = {
  data: [
    [1_786_000_000_000, 40, 41, 39, 39.5],
    [1_786_003_600_000, 39.5, 40, 38, 38.7],
  ],
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function routedFetch({ dvolFails = false } = {}) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("get_volatility_index_data"))
      return dvolFails
        ? Promise.reject(new Error("dvol down"))
        : jsonResponse({ result: DVOL });
    return jsonResponse({
      result: url.includes("currency=USDC") ? USDC_BOOK : BTC_BOOK,
    });
  });
}

/** Book calls only — the chain also reads DVOL, which is a different endpoint. */
function bookCalls() {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url]) =>
      String(url).includes("get_book_summary_by_currency"),
    );
}

describe("DeribitProvider", () => {
  let DeribitProvider: typeof DeribitProviderType;

  beforeEach(async () => {
    DeribitProvider = await loadProvider();
    vi.stubGlobal("fetch", routedFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises the options-chain capability", () => {
    expect(new DeribitProvider().capabilities).toContain("options-chain");
  });

  it("maps an inverse book into USD-denominated contracts with decimal IV", async () => {
    const chain = await new DeribitProvider().getOptionsChain("btc");

    expect(chain.symbol).toBe("BTC");
    expect(chain.delayMinutes).toBe(0);
    // The index price, not the per-expiry forward (which is 5% higher here).
    expect(chain.underlyingPrice).toBe(BTC_INDEX);

    const atm = chain.contracts.find(
      (c) => c.contract === "BTC-7AUG26-60000-C",
    )!;
    expect(atm).toMatchObject({
      // Deribit's own instrument name is the contract id — what a user would
      // paste back into the venue.
      contract: "BTC-7AUG26-60000-C",
      // 08:00 UTC settlement formatted in UTC, so no off-by-one west of Greenwich.
      expiry: "2026-08-07",
      strike: 60_000,
      side: "call",
      openInterest: 156.6,
      volume: 102,
    });
    // 42% arrives as 42 and must leave as 0.42.
    expect(atm.iv).toBeCloseTo(0.42, 10);
    // 0.005 BTC of premium is $300 at a $60k index — not $0.005.
    expect(atm.bid).toBeCloseTo(0.005 * BTC_INDEX, 6);
    expect(atm.ask).toBeCloseTo(0.02 * BTC_INDEX, 6);
    expect(atm.lastPrice).toBeCloseTo(0.015 * BTC_INDEX, 6);
  });

  it("leaves greeks undefined — the book-summary endpoint publishes none", async () => {
    const chain = await new DeribitProvider().getOptionsChain("BTC");
    for (const key of ["delta", "gamma", "vega", "theta", "rho"] as const)
      expect(chain.contracts.every((c) => c[key] === undefined)).toBe(true);
  });

  it("drops a price the venue does not quote instead of reporting zero", async () => {
    const chain = await new DeribitProvider().getOptionsChain("BTC");
    expect(
      chain.contracts.find((c) => c.contract === "BTC-7AUG26-58000-C")!.bid,
    ).toBeUndefined();
    expect(
      chain.contracts.find((c) => c.contract === "BTC-26SEP26-70000-P")!
        .lastPrice,
    ).toBeUndefined();
  });

  it("sorts by expiry, then strike, then side", async () => {
    const chain = await new DeribitProvider().getOptionsChain("BTC");
    expect(chain.contracts.map((c) => c.contract)).toEqual([
      "BTC-7AUG26-58000-C",
      "BTC-7AUG26-60000-C",
      "BTC-7AUG26-60000-P",
      "BTC-26SEP26-70000-P",
    ]);
  });

  it("keeps the chain's decimal IV and the summary's percent IV apart", async () => {
    const provider = new DeribitProvider();
    const chain = await provider.getOptionsChain("BTC");
    const summary = await provider.getOptionsSummary("BTC");
    // Both read the same mark_iv figures; only the chain rescales.
    expect(Math.max(...chain.contracts.map((c) => c.iv!))).toBeLessThan(1);
    expect(summary.avgIv).toBeGreaterThan(1);
  });

  it("shares ONE book fetch between the summary and the chain", async () => {
    const provider = new DeribitProvider();
    await provider.getOptionsSummary("BTC");
    await provider.getOptionsChain("BTC");
    expect(bookCalls()).toHaveLength(1);
  });

  it("fills iv30 from DVOL, rescaled out of the venue's percent", async () => {
    const chain = await new DeribitProvider().getOptionsChain("BTC");
    // The series' latest close, 38.7%, as the decimal iv30 contract wants it.
    expect(chain.iv30).toBeCloseTo(0.387, 10);
  });

  it("keeps the chain when DVOL is unreachable", async () => {
    vi.stubGlobal("fetch", routedFetch({ dvolFails: true }));
    const chain = await new DeribitProvider().getOptionsChain("BTC");
    // A secondary header stat must never blank out a table of live contracts.
    expect(chain.iv30).toBeUndefined();
    expect(chain.contracts).toHaveLength(4);
  });

  it("skips DVOL entirely for an underlying that has none", async () => {
    const chain = await new DeribitProvider().getOptionsChain("SOL");
    expect(chain.iv30).toBeUndefined();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("get_volatility_index_data"),
        ),
    ).toBe(false);
  });

  it("reads a linear underlying out of the combined USDC book", async () => {
    const chain = await new DeribitProvider().getOptionsChain("SOL");
    expect(bookCalls()[0][0]).toContain("currency=USDC");
    expect(chain.contracts).toHaveLength(1);
    // USDC-quoted premiums are already dollars — no index scaling here.
    expect(chain.contracts[0]).toMatchObject({
      strike: 116,
      bid: 1.5,
      ask: 2.5,
    });
  });

  it("parses Deribit's `d`-for-decimal-point strikes", async () => {
    const provider = new DeribitProvider();
    expect((await provider.getOptionsChain("TRX")).contracts[0].strike).toBe(
      0.41,
    );
    expect((await provider.getOptionsChain("XRP")).contracts[0].strike).toBe(
      1.25,
    );
  });

  it("returns an empty chain — not an error — for an unlisted underlying", async () => {
    // No options on DOGE is a fact about the venue, not an outage, so the frame
    // gets an empty chain to render its empty state.
    const chain = await new DeribitProvider().getOptionsChain("DOGE");
    expect(chain).toEqual({ symbol: "DOGE", delayMinutes: 0, contracts: [] });
  });

  it("throws only on a malformed response", async () => {
    vi.stubGlobal("fetch", () => jsonResponse({ result: [] }));
    await expect(new DeribitProvider().getOptionsChain("BTC")).rejects.toThrow(
      /unexpected response shape/,
    );
  });
});
