/**
 * Helpers shared across the frame-meta topic files — provider credits,
 * source/symbol field builders, and curated symbol/region lists. Internal to
 * the schemas module; the public surface stays `../schemas` (the barrel).
 */
import type { FrameSource } from "@zframes/spec/frame";
import { z } from "zod";

export const widgetIcon = (name: string) => `/widget-icons/${name}.png`;

/**
 * Optional provider pin for frames whose capability more than one exchange
 * can serve. Capability routing is first-match, so without this a second
 * source (e.g. Bitkub) is never reached; naming it here routes THIS card to
 * that provider. Symbols are source-native, so they change with the source:
 * Hyperliquid wants "BTC"/"xyz:TSLA", Bitkub wants "BTC"/"KUB".
 */
export const sourceField = () =>
  z
    .enum(["hyperliquid", "bitkub", "nasdaq"])
    .optional()
    .describe(
      'Which venue to source this card from — "hyperliquid" (default: crypto + HIP-3 stock/commodity perps, USD), "bitkub" (Thailand\'s largest exchange, THB-quoted, the source where KUB trades), or "nasdaq" (the real consolidated tape for US-listed stocks, DAILY bars only — no intraday, no crypto). Omit for the default. Use source-native symbols: Bitkub lists bare tickers like "KUB"/"BTC" and has no HIP-3 stock perps; Nasdaq wants a plain US ticker like "NVDA". Pin "nasdaq" when a stock card should show the actual listing rather than its perp: the HIP-3 perp tracks direction but its volume and open interest are Hyperliquid\'s book, not the listing\'s. Nasdaq only answers for symbols a card names, so it cannot back a card that scans a whole universe (top movers).',
    );

/**
 * Stamp each credit with its record key as `id`. Done structurally rather than
 * per entry so a new source cannot forget one — the chrome uses the id to credit
 * only the provider a pick-one card is actually reading, and a missing id would
 * silently fall back to the first-declared entry.
 */
export function withSourceIds<
  T extends Record<string, Omit<FrameSource, "id">>,
>(map: T): { [K in keyof T]: T[K] & { id: K & string } } {
  return Object.fromEntries(
    Object.entries(map).map(([id, source]) => [id, { ...source, id }]),
  ) as { [K in keyof T]: T[K] & { id: K & string } };
}

/**
 * Canonical data-source credits. Each frame links its provider from the card
 * chrome (see core's FrameContent); the URL lives here in exactly one place.
 * The record key doubles as the credit's `id`, and for the exchanges it matches
 * `sourceField()`'s enum values — that pairing is what lets a card crediting
 * several exchanges narrow to the one it is reading.
 */
export const SOURCES = withSourceIds({
  hyperliquid: { name: "Hyperliquid", url: "https://hyperliquid.xyz" },
  defillama: { name: "DeFiLlama", url: "https://defillama.com" },
  coingecko: { name: "CoinGecko", url: "https://www.coingecko.com" },
  alternativeMe: {
    name: "alternative.me",
    url: "https://alternative.me/crypto/fear-and-greed-index/",
  },
  bls: { name: "BLS", url: "https://www.bls.gov" },
  nyFed: {
    name: "NY Fed",
    url: "https://www.newyorkfed.org/markets/reference-rates",
  },
  treasury: { name: "U.S. Treasury", url: "https://fiscaldata.treasury.gov" },
  secEdgar: { name: "SEC EDGAR", url: "https://www.sec.gov/edgar" },
  finra: {
    name: "FINRA",
    url: "https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data",
  },
  ofr: {
    name: "OFR",
    url: "https://www.financialresearch.gov/financial-stress-index/",
  },
  mempool: { name: "mempool.space", url: "https://mempool.space" },
  deribit: { name: "Deribit", url: "https://www.deribit.com" },
  coinpaprika: { name: "Coinpaprika", url: "https://coinpaprika.com" },
  frankfurter: { name: "Frankfurter (ECB)", url: "https://frankfurter.dev" },
  coinMetrics: { name: "Coin Metrics", url: "https://coinmetrics.io" },
  bitcoinData: { name: "bitcoin-data.com", url: "https://bitcoin-data.com" },
  ultrasound: { name: "ultrasound.money", url: "https://ultrasound.money" },
  polymarket: { name: "Polymarket", url: "https://polymarket.com" },
  sosovalue: { name: "SoSoValue", url: "https://sosovalue.com" },
  geckoterminal: {
    name: "GeckoTerminal",
    url: "https://www.geckoterminal.com",
  },
  blockchair: { name: "Blockchair", url: "https://blockchair.com" },
  bitkub: { name: "Bitkub", url: "https://www.bitkub.com" },
  goldApi: { name: "gold-api.com", url: "https://gold-api.com" },
  lbma: {
    name: "LBMA",
    url: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
  },
  cftc: {
    name: "CFTC",
    url: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
  },
  fred: { name: "FRED", url: "https://fred.stlouisfed.org" },
  zillow: {
    name: "Zillow Research",
    url: "https://www.zillow.com/research/data/",
  },
  fhfa: {
    name: "FHFA",
    url: "https://www.fhfa.gov/data/hpi",
  },
  nasdaq: { name: "Nasdaq", url: "https://www.nasdaq.com" },
  cboe: { name: "Cboe", url: "https://www.cboe.com" },
});

/**
 * The one company a deep-dive card is about. Shared so every equity-research
 * frame spells the field identically and the editor offers the same help — a
 * board about NVDA sets the same string on a dozen cards.
 */
export const companySymbolField = () =>
  z
    .string()
    .min(1)
    .describe(
      'US-listed company to analyse — a ticker ("NVDA", "AAPL"). A HIP-3 symbol ("xyz:NVDA") works too; the dex prefix is stripped.',
    );

// Shared config for the source-agnostic portfolio frames. The source is chosen
// per instance; the keyed Binance source needs a one-time in-app connect (its
// read-only key is stored locally, never in this spec), the wallet source just
// needs a public address.
export const portfolioConfigShape = {
  source: z
    .enum(["binance", "wallet"])
    .default("binance")
    .describe(
      'Where the holdings come from: "binance" (a connected Binance account — a read-only API key is entered in-app and stored locally, never in this file) or "wallet" (a public on-chain address, keyless).',
    ),
  address: z
    .string()
    .default("")
    .describe(
      'For source "wallet": the public Ethereum address (0x…) or ENS name to track. Public on-chain data, no keys. Ignored for "binance".',
    ),
};

export const bubbleTopN = (max: number, def: number, what: string) =>
  z
    .number()
    .int()
    .min(3)
    .max(max)
    .default(def)
    .describe(`How many of the largest ${what} to show.`);

// Every metals frame speaks the same two vocabularies, so they're declared once
// here: the spot universe (what gold-api quotes) and the subset the LBMA
// publishes a daily London fix for (copper has no fix, so history/ratio frames
// can't offer it).
export const METAL_SYMBOLS = ["XAU", "XAG", "XPT", "XPD", "HG"] as const;

export const FIXED_METALS = ["XAU", "XAG", "XPT", "XPD"] as const;

export const METAL_NAMES =
  "XAU gold, XAG silver, XPT platinum, XPD palladium, HG copper (copper is quoted per pound; the rest per troy ounce)";

export const FIXED_METAL_NAMES =
  "XAU gold, XAG silver, XPT platinum, XPD palladium. Gold and silver go back to 1968, platinum and palladium to 1990.";

/** Years of fix history a chart frame reads — shared bounds and wording. */
export const yearsField = (dflt: number, describe: string) =>
  z.number().int().min(1).max(58).default(dflt).describe(describe);

/**
 * The market indices FRED republishes as a keyless CSV. Kept here (not imported
 * from the provider) because `schemas.ts` must stay React- and provider-free —
 * the frame layer never sees a provider package. `tests/capability-coverage.test.ts`
 * is what keeps the two sides honest.
 */
export const INDEX_SERIES = ["SP500", "VIXCLS", "NASDAQCOM"] as const;

/** How far back each index actually goes, for the schema's own description. */
export const INDEX_SERIES_NOTE =
  "SP500 = S&P 500, VIXCLS = VIX (volatility), NASDAQCOM = Nasdaq Composite. Note FRED redistributes SP500 under licence with only a ~10-year rolling window, while NASDAQCOM runs back to 1971 — a longer `years` than the series carries simply shows everything there is.";

/** The 50 states plus DC, as FHFA keys its state-level HPI file. */
export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

/** Zillow's own metro names — they must match its published `RegionName` exactly. */
export const ZHVI_REGIONS = [
  "United States",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Dallas, TX",
  "Houston, TX",
  "Washington, DC",
  "Philadelphia, PA",
  "Miami, FL",
  "Atlanta, GA",
  "Boston, MA",
  "Phoenix, AZ",
  "San Francisco, CA",
  "Riverside, CA",
  "Detroit, MI",
  "Seattle, WA",
  "Minneapolis, MN",
  "San Diego, CA",
  "Tampa, FL",
  "Denver, CO",
  "Austin, TX",
  "Nashville, TN",
  "Portland, OR",
  "Las Vegas, NV",
] as const;
