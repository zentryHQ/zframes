import type {
  Capability,
  CotConcentration,
  CotDisaggregated,
  CotTraderClass,
  CotWeek,
  GoldReserve,
  GoldReserveEntry,
  MarketDataProvider,
  MetalHistory,
  MetalPositioning,
  MetalSpot,
  OfficialSeries,
  SeriesPoint,
  TokenizedGold,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { parseCsvRows } from "@zframes/data-primitives/csv";
import { fetchJson, fetchText } from "@zframes/data-primitives/fetch";

/**
 * Keyless metals provider. Gold is the anchor, but every source below covers
 * the wider precious/industrial complex, so one provider serves them all:
 *
 *  - **Spot** — gold-api.com, a free no-key CORS-open quote endpoint, one call
 *    per metal (XAU/XAG/XPT/XPD plus copper).
 *  - **History** — the LBMA's own published London fix files: daily benchmark
 *    prices in USD/GBP/EUR, gold and silver back to **1968**, platinum and
 *    palladium to 1990. This is the reference price the physical market settles
 *    against, not a scraped chart feed, and it's the deepest keyless price
 *    history in the whole zframes fleet.
 *  - **Positioning** — the CFTC's own public-reporting Socrata datasets, weekly:
 *    the legacy futures-only Commitments of Traders since 2010, enriched
 *    week-by-week with the **disaggregated** report (2006-06-13 onwards), which
 *    splits the legacy `commercial` bucket into producer/merchant hedgers and
 *    swap dealers and adds trader counts and concentration.
 *  - **Official reserve** — the U.S. Treasury's monthly gold-reserve status
 *    report (Fort Knox / West Point / Denver / NY Fed), via fiscaldata.
 *  - **Tokenized gold** — PAXG/XAUT from CoinGecko's free tier, so the crypto
 *    wrapper's premium to physical spot is visible on the same board.
 *  - **Listed volatility** — Cboe's published daily histories for the ETF
 *    volatility indices (GVZ, VXSLV, VXGDX, OVX): the metals-and-energy
 *    counterpart of the VIX the equity side reads through `index-level`.
 *
 * Two calls need the runtime proxy — the Treasury one (fiscaldata isn't reliably
 * browser-CORS-reachable) and the Cboe one (`cdn.cboe.com` sends no
 * `Access-Control-Allow-Origin` header at all); both hosts are already on the
 * serve allowlist. Everything else, both CFTC datasets included, answers
 * `Access-Control-Allow-Origin: *` and is fetched direct.
 */

const SPOT_URL = "https://api.gold-api.com/price";
const LBMA_URL = "https://prices.lbma.org.uk/json";
const COT_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
/** The disaggregated futures-only report — a separate dataset, same host and keying. */
const COT_DISAGG_URL =
  "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
const RESERVE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/gold_reserve";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";
const CBOE_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices";

/**
 * Weeks requested from each COT dataset. Shared by both calls so the two reports
 * cover the same window by construction — a wider disaggregated request would
 * only return weeks with no legacy week to merge onto.
 */
const COT_WEEKS = 520;

interface MetalDef {
  /** Display name, matching what gold-api returns. */
  name: string;
  /** LBMA fix file basename, or null where the LBMA publishes no fix (copper). */
  lbma: string | null;
  /** CFTC contract market code for the US futures contract, or null. */
  cotCode: string | null;
  /** Market name to label the COT series with. */
  cotMarket: string | null;
  /** Contract size in the metal's native unit (troy oz; copper pounds). */
  contractSize: number;
}

/** The metal universe, in board order. Keys are the symbols the API speaks. */
const METALS: Record<string, MetalDef> = {
  XAU: {
    name: "Gold",
    lbma: "gold_pm",
    cotCode: "088691",
    cotMarket: "GOLD - COMMODITY EXCHANGE INC.",
    contractSize: 100,
  },
  XAG: {
    name: "Silver",
    lbma: "silver",
    cotCode: "084691",
    cotMarket: "SILVER - COMMODITY EXCHANGE INC.",
    contractSize: 5_000,
  },
  XPT: {
    name: "Platinum",
    lbma: "platinum_pm",
    cotCode: "076651",
    cotMarket: "PLATINUM - NEW YORK MERCANTILE EXCHANGE",
    contractSize: 50,
  },
  XPD: {
    name: "Palladium",
    lbma: "palladium_pm",
    cotCode: "075651",
    cotMarket: "PALLADIUM - NEW YORK MERCANTILE EXCHANGE",
    contractSize: 100,
  },
  HG: {
    name: "Copper",
    lbma: null,
    cotCode: "085692",
    cotMarket: "COPPER- #1 - COMMODITY EXCHANGE INC.",
    contractSize: 25_000,
  },
};

const DEFAULT_SYMBOLS = Object.keys(METALS);

/** The LBMA publishes each fix in three currencies, in this column order. */
const LBMA_CURRENCIES = ["USD", "GBP", "EUR"] as const;

/** Publisher credit on the volatility series. */
const CBOE_SOURCE = "Cboe";

/**
 * The listed volatility indices Cboe publishes a daily history for, id → label.
 *
 * Each measures 30-day implied volatility on options on the **ETF** named, not on
 * the metal's own futures — the ETF chain is where the liquid listed vol actually
 * trades, so it's the series a desk quotes. Verified live, with the first
 * observation each published file actually carries:
 *
 *  - `GVZ`   — SPDR Gold Shares (GLD), 4,243 rows from 2009-09-18.
 *  - `VXSLV` — iShares Silver Trust (SLV), 3,051 rows from 2011-03-16.
 *  - `VXGDX` — VanEck Gold Miners (GDX), 2,967 rows from 2011-03-16. Miner vol
 *    runs well above metal vol; that gap *is* the leverage the equity carries.
 *  - `OVX`   — United States Oil Fund (USO), 4,243 rows from **2009-09-18**.
 *    Cboe launched the index in 2007, but the history file it publishes here
 *    starts with GVZ's first date, so a frame must not promise 2007 depth.
 */
const VOL_INDICES: Record<string, string> = {
  GVZ: "Gold ETF Volatility",
  VXSLV: "Silver ETF Volatility",
  VXGDX: "Gold Miners ETF Volatility",
  OVX: "Crude Oil ETF Volatility",
};

/** Coerce a wire value (Socrata and fiscaldata send numbers as strings) to a finite number. */
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Normalise a caller's symbol list to known, de-duplicated metal symbols. */
function wantedSymbols(symbols?: string[]): string[] {
  const list = symbols?.length ? symbols : DEFAULT_SYMBOLS;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const symbol = raw.trim().toUpperCase();
    if (METALS[symbol] && !seen.has(symbol)) {
      seen.add(symbol);
      out.push(symbol);
    }
  }
  return out;
}

// Spot moves continuously and the endpoint is a tiny single-object payload, so
// the TTL sits just under the hook's 60s poll: reloads and sibling frames reuse
// one quote, background polls still refresh. Not persisted — a stale price
// rehydrated from a previous session would read as live.
const spotCache = new TtlCache<MetalSpot>({
  namespace: "zframes:metals:spot",
  ttlMs: 45_000,
  persist: false,
});

// The LBMA fix files are the full history in one document (~150 KB gzipped for
// gold), and the fix publishes twice a business day — so the TTL is long and,
// unlike every small provider payload, this one is NOT persisted: several
// decades of daily points per metal would blow the localStorage budget for
// every other cache. One download per metal per 6h serves every metals frame on
// the board through the shared in-memory entry.
const historyCache = new TtlCache<MetalHistory[]>({
  namespace: "zframes:metals:history",
  ttlMs: 6 * 60 * 60_000,
  persist: false,
});

// Latest LBMA USD fix per symbol, filled as histories resolve. getMetalSpot
// reads it to attach a change-vs-fix (see getMetalSpot).
const lastFix = new Map<string, number>();

/**
 * How long a cold `getMetalSpot` waits for the fix history before answering
 * without a change column. The LBMA file lands in ~1.5s; past this the price
 * is worth more than the delta, and the download completes into the shared
 * cache regardless, so the next poll fills the column in.
 */
const FIX_WARMUP_MS = 3_000;

// COT publishes Friday afternoon for the prior Tuesday — weekly data behind a
// 6h TTL, small enough (a few hundred rows of nine numbers) to persist.
const cotCache = new TtlCache<MetalPositioning>({
  namespace: "zframes:metals:cot",
  ttlMs: 6 * 60 * 60_000,
  persist: true,
});

// The disaggregated report is the same weekly cadence as its legacy sibling, so
// the TTL sits just under the hook's 6h poll and background polls still refresh.
//
// NOT persisted, unlike that sibling, and the payload is why: the 55 published
// columns this maps come back as **~1 MB of JSON per metal** for a 520-week
// window (measured live on all five), against the legacy report's nine columns.
// Five metals persisted would land right on the ~5 MB origin localStorage quota,
// where `setItem` throws into the cache's swallowing write guard and persistence
// silently stops — for every other provider's small payloads too, with no
// symptom. In-memory sharing already gives a board with three gold cards one
// download; surviving a reload isn't worth spending the whole origin budget.
//
// Keys are metal symbols, so the fan-out is the five-metal universe and cannot
// drift; `maxEntries` is a backstop rather than a working limit.
const cotDisaggCache = new TtlCache<DisaggWeek[]>({
  namespace: "zframes:metals:cot-disagg",
  ttlMs: 5 * 60 * 60_000,
  persist: false,
  maxEntries: 8,
});

// One daily close per index, so the TTL sits just under the 6h
// `commodity-vol-index` poll. Not persisted — the files are 89–156 KB of CSV
// (GVZ 4,243 rows, VXSLV 3,051), the same call the LBMA fix history above makes,
// and four indices of parsed points would crowd localStorage for every small
// payload. Keyed by index id, so the fan-out is VOL_INDICES.
const volCache = new TtlCache<OfficialSeries>({
  namespace: "zframes:metals:vol-index",
  ttlMs: 5 * 60 * 60_000,
  persist: false,
  maxEntries: 8,
});

// The Treasury's gold-reserve report is monthly; a 12h TTL under the frame's
// daily poll is generous, and the payload is eight lines.
const reserveCache = new TtlCache<GoldReserve>({
  namespace: "zframes:metals:reserve",
  ttlMs: 12 * 60 * 60_000,
  persist: true,
});

// CoinGecko's free tier is rate-limited and shared with the CoinGecko provider,
// so this sits just under the hook's 15m poll.
const tokenCache = new TtlCache<TokenizedGold[]>({
  namespace: "zframes:metals:tokenized",
  ttlMs: 12 * 60_000,
  persist: true,
});

interface GoldApiQuote {
  name?: string;
  price?: number;
  symbol?: string;
  updatedAt?: string;
}

/** One LBMA fix row: `d` the date, `v` the price in [USD, GBP, EUR]. */
interface LbmaRow {
  d?: string;
  v?: (number | null)[];
}

interface CotRow {
  report_date_as_yyyy_mm_dd?: string;
  open_interest_all?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
  /** CFTC's own field name — the typo ("postions") is in their schema, not ours. */
  noncomm_postions_spread_all?: string;
  comm_positions_long_all?: string;
  comm_positions_short_all?: string;
  nonrept_positions_long_all?: string;
  nonrept_positions_short_all?: string;
}

/**
 * Every disaggregated column this provider maps, in ONE list so the `$select`
 * and the row type below can't drift apart — a name that exists in only one of
 * the two is the failure mode this shape exists to prevent.
 *
 * **The swap-dealer short and spread columns carry a DOUBLE underscore**
 * (`swap__positions_short_all`, `swap__positions_spread_all`) while the long one
 * has a single (`swap_positions_long_all`). That is a defect in the CFTC's own
 * schema — the same class as the legacy report's `noncomm_postions_spread_all`
 * typo above — and Socrata answers a single-underscore guess by simply omitting
 * the column rather than erroring, so the card renders zeros and nothing says
 * why. Verified live: every name below comes back non-null for all five metals.
 *
 * The `_all` suffix is inconsistent by class too, so there is no pattern to
 * derive and each name is read exactly as published: swap / managed-money /
 * non-reportable carry it, producer-merchant and other-reportable don't, and
 * `traders_other_rept_short` drops it where `traders_other_rept_long_all` keeps
 * it. `m_money_positions_spread` and `change_in_m_money_spread` likewise lack
 * the `_all` their long/short siblings have.
 */
const DISAGG_FIELDS = [
  "report_date_as_yyyy_mm_dd",
  // Positions, by trader class.
  "prod_merc_positions_long",
  "prod_merc_positions_short",
  "swap_positions_long_all",
  "swap__positions_short_all",
  "swap__positions_spread_all",
  "m_money_positions_long_all",
  "m_money_positions_short_all",
  "m_money_positions_spread",
  "other_rept_positions_long",
  "other_rept_positions_short",
  "other_rept_positions_spread",
  "nonrept_positions_long_all",
  "nonrept_positions_short_all",
  // Week-over-week changes, as the agency computed them.
  "change_in_prod_merc_long",
  "change_in_prod_merc_short",
  "change_in_swap_long_all",
  "change_in_swap_short_all",
  "change_in_swap_spread_all",
  "change_in_m_money_long_all",
  "change_in_m_money_short_all",
  "change_in_m_money_spread",
  "change_in_other_rept_long",
  "change_in_other_rept_short",
  "change_in_other_rept_spread",
  "change_in_nonrept_long_all",
  "change_in_nonrept_short_all",
  // Share of total open interest, percent.
  "pct_of_oi_prod_merc_long",
  "pct_of_oi_prod_merc_short",
  "pct_of_oi_swap_long_all",
  "pct_of_oi_swap_short_all",
  "pct_of_oi_m_money_long_all",
  "pct_of_oi_m_money_short_all",
  "pct_of_oi_other_rept_long",
  "pct_of_oi_other_rept_short",
  "pct_of_oi_nonrept_long_all",
  "pct_of_oi_nonrept_short_all",
  // Trader counts. Non-reportables have none by definition — they are the
  // positions below the threshold at which a trader must report at all.
  "traders_tot_all",
  "traders_prod_merc_long_all",
  "traders_prod_merc_short_all",
  "traders_swap_long_all",
  "traders_swap_short_all",
  "traders_m_money_long_all",
  "traders_m_money_short_all",
  "traders_other_rept_long_all",
  "traders_other_rept_short",
  // Concentration in the largest 4 and 8 traders, percent.
  "conc_gross_le_4_tdr_long",
  "conc_gross_le_4_tdr_short",
  "conc_gross_le_8_tdr_long",
  "conc_gross_le_8_tdr_short",
  "conc_net_le_4_tdr_long_all",
  "conc_net_le_4_tdr_short_all",
  "conc_net_le_8_tdr_long_all",
  "conc_net_le_8_tdr_short_all",
  // The published contract unit, e.g. "(CONTRACTS OF 100 TROY OUNCES)".
  "contract_units",
] as const;

const DISAGG_SELECT = DISAGG_FIELDS.join(",");

/** A disaggregated row, typed off the selected columns — Socrata sends strings. */
type CotDisaggRow = Partial<Record<(typeof DISAGG_FIELDS)[number], string>>;

/** One mapped disaggregated week, keyed by the same epoch the legacy week carries. */
interface DisaggWeek {
  time: number;
  data: CotDisaggregated;
}

interface ReserveRow {
  record_date?: string;
  facility_desc?: string;
  form_desc?: string;
  location_desc?: string;
  fine_troy_ounce_qty?: string;
  book_value_amt?: string;
}

interface CoinGeckoMarket {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  market_cap?: number;
  total_volume?: number;
  circulating_supply?: number;
}

/** Fetch and parse one metal's whole LBMA fix history for one currency. */
async function loadLbma(
  symbol: string,
  file: string,
  currency: string,
): Promise<MetalHistory> {
  const column = LBMA_CURRENCIES.indexOf(
    currency as (typeof LBMA_CURRENCIES)[number],
  );
  const rows = await fetchJson<LbmaRow[]>(
    `${LBMA_URL}/${file}.json`,
    undefined,
    {
      // Decades of daily fixes in one document — well past the shared default.
      timeoutMs: 30_000,
    },
  );
  if (!Array.isArray(rows)) throw new Error(`lbma ${file}: unexpected shape`);
  const points: SeriesPoint[] = [];
  for (const row of rows) {
    const value = num(row?.v?.[column]);
    // Pre-1999 rows carry a null EUR column, and the odd row is blank; both are
    // simply absent from the series rather than rendering as a zero.
    if (!row?.d || value === null || value <= 0) continue;
    const time = Date.parse(`${row.d}T00:00:00Z`);
    if (!Number.isFinite(time)) continue;
    points.push({ time, value });
  }
  if (points.length === 0) throw new Error(`lbma ${file}: no usable rows`);
  points.sort((a, b) => a.time - b.time);
  // USD is the fix the spot change is measured against; remember the newest.
  if (currency === "USD") lastFix.set(symbol, points[points.length - 1].value);
  return { symbol, currency, points };
}

/** One cache entry per (symbol, currency) so boards in EUR don't evict the USD board. */
function historyFor(symbol: string, currency: string): Promise<MetalHistory> {
  const def = METALS[symbol];
  if (!def?.lbma)
    return Promise.reject(new Error(`no LBMA fix published for ${symbol}`));
  const file = def.lbma;
  return historyCache
    .get(`${symbol}:${currency}`, async () => [
      await loadLbma(symbol, file, currency),
    ])
    .then(([history]) => history);
}

/**
 * Assemble one trader class from its published columns.
 *
 * `long`/`short` are required by the interface, so they fall back to 0. Every
 * optional field is left **undefined** when its column is absent rather than
 * collapsed to 0, because the absences here are real and meaningful: the
 * producer/merchant and non-reportable classes never spread, and non-reportables
 * have no trader counts at all. A zero would read as "flat this week".
 */
function traderClass(parts: {
  long: unknown;
  short: unknown;
  spread?: unknown;
  changeLong?: unknown;
  changeShort?: unknown;
  changeSpread?: unknown;
  pctOfOiLong?: unknown;
  pctOfOiShort?: unknown;
  tradersLong?: unknown;
  tradersShort?: unknown;
}): CotTraderClass {
  return {
    long: num(parts.long) ?? 0,
    short: num(parts.short) ?? 0,
    spread: num(parts.spread) ?? undefined,
    changeLong: num(parts.changeLong) ?? undefined,
    changeShort: num(parts.changeShort) ?? undefined,
    changeSpread: num(parts.changeSpread) ?? undefined,
    pctOfOiLong: num(parts.pctOfOiLong) ?? undefined,
    pctOfOiShort: num(parts.pctOfOiShort) ?? undefined,
    tradersLong: num(parts.tradersLong) ?? undefined,
    tradersShort: num(parts.tradersShort) ?? undefined,
  };
}

/**
 * Concentration in the largest traders, or undefined when the gross columns the
 * interface requires aren't all published — the net pair stays optional on top.
 */
function concentrationFrom(row: CotDisaggRow): CotConcentration | undefined {
  const grossLong4 = num(row.conc_gross_le_4_tdr_long);
  const grossShort4 = num(row.conc_gross_le_4_tdr_short);
  const grossLong8 = num(row.conc_gross_le_8_tdr_long);
  const grossShort8 = num(row.conc_gross_le_8_tdr_short);
  if (
    grossLong4 === null ||
    grossShort4 === null ||
    grossLong8 === null ||
    grossShort8 === null
  )
    return undefined;
  return {
    grossLong4,
    grossShort4,
    grossLong8,
    grossShort8,
    netLong4: num(row.conc_net_le_4_tdr_long_all) ?? undefined,
    netShort4: num(row.conc_net_le_4_tdr_short_all) ?? undefined,
    netLong8: num(row.conc_net_le_8_tdr_long_all) ?? undefined,
    netShort8: num(row.conc_net_le_8_tdr_short_all) ?? undefined,
  };
}

/**
 * Map one disaggregated row, or null if it isn't one.
 *
 * The guard matters more than it looks: the two COT datasets live on the same
 * host and share several column names outright (`nonrept_positions_long_all` is
 * in both), so a legacy row reaching this function would otherwise map into a
 * week of zeros that looks published. Requiring the three classes the legacy
 * report cannot express — producer/merchant, swap dealers, managed money — is
 * what makes "this row is disaggregated" checkable rather than assumed.
 */
function disaggregatedFrom(row: CotDisaggRow): CotDisaggregated | null {
  if (
    num(row.prod_merc_positions_long) === null ||
    num(row.swap_positions_long_all) === null ||
    num(row.m_money_positions_long_all) === null
  )
    return null;
  return {
    producerMerchant: traderClass({
      long: row.prod_merc_positions_long,
      short: row.prod_merc_positions_short,
      changeLong: row.change_in_prod_merc_long,
      changeShort: row.change_in_prod_merc_short,
      pctOfOiLong: row.pct_of_oi_prod_merc_long,
      pctOfOiShort: row.pct_of_oi_prod_merc_short,
      tradersLong: row.traders_prod_merc_long_all,
      tradersShort: row.traders_prod_merc_short_all,
    }),
    swapDealer: traderClass({
      long: row.swap_positions_long_all,
      // Double underscore on short and spread, single on long — CFTC's schema,
      // not a typo here. See DISAGG_FIELDS.
      short: row.swap__positions_short_all,
      spread: row.swap__positions_spread_all,
      changeLong: row.change_in_swap_long_all,
      changeShort: row.change_in_swap_short_all,
      changeSpread: row.change_in_swap_spread_all,
      pctOfOiLong: row.pct_of_oi_swap_long_all,
      pctOfOiShort: row.pct_of_oi_swap_short_all,
      tradersLong: row.traders_swap_long_all,
      tradersShort: row.traders_swap_short_all,
    }),
    managedMoney: traderClass({
      long: row.m_money_positions_long_all,
      short: row.m_money_positions_short_all,
      spread: row.m_money_positions_spread,
      changeLong: row.change_in_m_money_long_all,
      changeShort: row.change_in_m_money_short_all,
      changeSpread: row.change_in_m_money_spread,
      pctOfOiLong: row.pct_of_oi_m_money_long_all,
      pctOfOiShort: row.pct_of_oi_m_money_short_all,
      tradersLong: row.traders_m_money_long_all,
      tradersShort: row.traders_m_money_short_all,
    }),
    otherReportable: traderClass({
      long: row.other_rept_positions_long,
      short: row.other_rept_positions_short,
      spread: row.other_rept_positions_spread,
      changeLong: row.change_in_other_rept_long,
      changeShort: row.change_in_other_rept_short,
      changeSpread: row.change_in_other_rept_spread,
      pctOfOiLong: row.pct_of_oi_other_rept_long,
      pctOfOiShort: row.pct_of_oi_other_rept_short,
      tradersLong: row.traders_other_rept_long_all,
      tradersShort: row.traders_other_rept_short,
    }),
    nonReportable: traderClass({
      long: row.nonrept_positions_long_all,
      short: row.nonrept_positions_short_all,
      changeLong: row.change_in_nonrept_long_all,
      changeShort: row.change_in_nonrept_short_all,
      pctOfOiLong: row.pct_of_oi_nonrept_long_all,
      pctOfOiShort: row.pct_of_oi_nonrept_short_all,
    }),
    totalTraders: num(row.traders_tot_all) ?? undefined,
    concentration: concentrationFrom(row),
    // Surfaced as published rather than folded into `contractSize`, which stays
    // the provider's own hardcoded number so the five shipped frames reading it
    // keep the value they have.
    contractUnits: row.contract_units,
  };
}

/**
 * Fetch and map one metal's disaggregated weeks, newest-first off the wire.
 *
 * Fetched **direct, not proxied**: publicreporting.cftc.gov answers
 * `Access-Control-Allow-Origin: *`, exactly like the legacy call beside it.
 */
async function loadDisaggregated(
  key: string,
  code: string,
): Promise<DisaggWeek[]> {
  const url =
    `${COT_DISAGG_URL}?$select=${DISAGG_SELECT}` +
    `&cftc_contract_market_code=${code}` +
    `&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=${COT_WEEKS}`;
  const rows = await fetchJson<CotDisaggRow[]>(url, undefined, {
    // ~1 MB per metal at this width and window — the shared default is for the
    // small payloads, so this gets the LBMA history's allowance.
    timeoutMs: 30_000,
  });
  if (!Array.isArray(rows))
    throw new Error(`cftc disaggregated ${key}: unexpected shape`);
  const weeks: DisaggWeek[] = [];
  for (const row of rows) {
    // Both datasets publish the same Socrata timestamp field in the same format
    // ("2026-07-28T00:00:00.000") and both are parsed with this identical call,
    // so the epochs align by construction and the merge downstream is exact.
    const time = Date.parse(row?.report_date_as_yyyy_mm_dd ?? "");
    if (!Number.isFinite(time)) continue;
    const data = disaggregatedFrom(row);
    if (data) weeks.push({ time, data });
  }
  if (weeks.length === 0)
    throw new Error(`cftc disaggregated ${key}: no usable rows`);
  return weeks;
}

/** ISO date (`YYYY-MM-DD`) of an epoch, in UTC — how the series reports its date. */
function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Parse Cboe's `MM/DD/YYYY` date to UTC midnight, so the epoch is the same
 * whatever zone the viewer sits in (these are daily closes, not intraday
 * prints). Anything not that shape — a stray footer line, a header repeat —
 * yields null and costs one row.
 */
function cboeDate(cell: string | undefined): number | null {
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cell?.trim() ?? "");
  if (!parts) return null;
  const iso = `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

/**
 * Locate the close column by NAME, never by position.
 *
 * Cboe's history files come in two shapes and both are live: `DATE,GVZ`
 * (close-only — GVZ and OVX) and `DATE,OPEN,HIGH,LOW,CLOSE` (VXSLV, VXGDX, VIX).
 * A parser that assumed either one reads the wrong column on the other and says
 * nothing: on an OHLC file column 1 is the OPEN, so a close-only assumption
 * publishes each day's open as its close — a plausible-looking series that is
 * quietly the wrong number.
 */
function closeColumn(header: string[], indexId: string): number {
  const names = header.map((cell) => cell.trim().toUpperCase());
  if (names[0] !== "DATE")
    throw new Error(`cboe ${indexId}: unexpected CSV header`);
  const close = names.indexOf("CLOSE");
  if (close > 0) return close;
  // Close-only files name the single value column after the index itself.
  const own = names.indexOf(indexId.toUpperCase());
  if (own > 0) return own;
  throw new Error(`cboe ${indexId}: no close column in [${names.join(",")}]`);
}

/** Fetch and parse one Cboe volatility-index history into the published-series shape. */
async function loadVolIndex(indexId: string): Promise<OfficialSeries> {
  const csv = await fetchText(`${CBOE_URL}/${indexId}_History.csv`, {
    // cdn.cboe.com sends no `Access-Control-Allow-Origin` at all, so a browser
    // cannot read it directly — the runtime relays it (the host is already on the
    // serve allowlist), and in Node this is a no-op. On a static host with no
    // runtime the frame degrades to empty, like every other proxied provider.
    proxied: true,
    timeoutMs: 20_000,
  });
  const rows = parseCsvRows(csv);
  const column = closeColumn(rows[0] ?? [], indexId);
  const points: SeriesPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    const time = cboeDate(rows[i][0]);
    const value = num(rows[i][column]?.trim());
    // A blank cell coerces to 0 and a non-calculating session prints 0 outright;
    // neither is a volatility reading, and an index can't legitimately be zero.
    if (time === null || value === null || value <= 0) continue;
    points.push({ time, value });
  }
  if (points.length === 0) throw new Error(`cboe ${indexId}: no usable rows`);
  points.sort((a, b) => a.time - b.time);
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  return {
    seriesId: indexId,
    label: VOL_INDICES[indexId],
    // `index`, not `percent`, even though the level reads as an annualised
    // volatility in percent — because `unit` is what decides how `change` is
    // denominated, and the fleet's other volatility index (FRED's VIXCLS, served
    // through `index-level`) is already an `index`. A gold-vol card next to an
    // equity-vol card must not report one move in percentage points and the
    // other in percent; the two numbers measure the same thing.
    unit: "index",
    frequency: "daily",
    latest: latest.value,
    date: isoDate(latest.time),
    change:
      previous && previous.value > 0
        ? ((latest.value - previous.value) / previous.value) * 100
        : 0,
    points,
    source: CBOE_SOURCE,
  };
}

export class MetalsProvider implements MarketDataProvider {
  readonly name = "metals";
  readonly capabilities: readonly Capability[] = [
    "metal-spot",
    "metal-history",
    "metal-positioning",
    "gold-reserve",
    "tokenized-gold",
    "commodity-vol-index",
  ];

  async getMetalSpot(symbols?: string[]): Promise<MetalSpot[]> {
    const wanted = wantedSymbols(symbols);
    // One endpoint per metal: fan out, and let a single metal's failure drop
    // that row rather than blanking the whole board.
    const quotes = await Promise.all(
      wanted.map((symbol) =>
        spotCache
          .get(symbol, async () => {
            const body = await fetchJson<GoldApiQuote>(
              `${SPOT_URL}/${symbol}`,
              undefined,
              { timeoutMs: 8_000 },
            );
            const price = num(body?.price);
            if (price === null || price <= 0)
              throw new Error(`gold-api ${symbol}: no price`);
            const updatedAt = Date.parse(body?.updatedAt ?? "");
            return {
              symbol,
              name: body?.name || METALS[symbol].name,
              price,
              updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
            } satisfies MetalSpot;
          })
          .catch(() => null),
      ),
    );

    // Change is measured against the latest London fix, which lives in the same
    // multi-hundred-KB history file the chart frames read. Warming it is
    // bounded, not blocking: give it FIX_WARMUP_MS (it lands in ~1.5s) so the
    // first paint of a board already carries its change column, but never hold
    // a live price hostage to a slow or dead LBMA — a late arrival simply lands
    // in the shared cache and the next poll picks it up.
    const cold = wanted.filter(
      (symbol) => METALS[symbol].lbma && !lastFix.has(symbol),
    );
    if (cold.length > 0) {
      const warmups = cold.map((symbol) =>
        historyFor(symbol, "USD").catch(() => null),
      );
      await Promise.race([
        Promise.allSettled(warmups),
        new Promise((resolve) => setTimeout(resolve, FIX_WARMUP_MS)),
      ]);
    }

    return quotes
      .filter((q): q is MetalSpot => q !== null)
      .map((quote) => {
        const fix = lastFix.get(quote.symbol);
        if (fix === undefined || fix <= 0) return quote;
        return {
          ...quote,
          prevFix: fix,
          changePct: ((quote.price - fix) / fix) * 100,
        };
      });
  }

  async getMetalHistory(
    symbols: string[],
    currency = "USD",
  ): Promise<MetalHistory[]> {
    const quote = currency.toUpperCase();
    const cur = (LBMA_CURRENCIES as readonly string[]).includes(quote)
      ? quote
      : "USD";
    const histories = await Promise.all(
      // Copper has no LBMA fix, so it silently drops out of a history request
      // rather than failing the frame that asked for the whole complex.
      wantedSymbols(symbols)
        .filter((symbol) => METALS[symbol].lbma)
        .map((symbol) => historyFor(symbol, cur).catch(() => null)),
    );
    return histories.filter((h): h is MetalHistory => h !== null);
  }

  async getMetalPositioning(symbol: string): Promise<MetalPositioning> {
    const key = wantedSymbols([symbol])[0] ?? "XAU";
    const def = METALS[key];
    if (!def.cotCode)
      throw new Error(`no CFTC futures market mapped for ${key}`);
    const code = def.cotCode;
    const legacy = cotCache.get(key, async () => {
      const fields = [
        "report_date_as_yyyy_mm_dd",
        "open_interest_all",
        "noncomm_positions_long_all",
        "noncomm_positions_short_all",
        "noncomm_postions_spread_all",
        "comm_positions_long_all",
        "comm_positions_short_all",
        "nonrept_positions_long_all",
        "nonrept_positions_short_all",
      ].join(",");
      // Newest-first from Socrata, capped at ~10 years of weeks; frames slice
      // their own window from the ascending series below.
      const url =
        `${COT_URL}?$select=${fields}` +
        `&cftc_contract_market_code=${code}` +
        `&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=${COT_WEEKS}`;
      const rows = await fetchJson<CotRow[]>(url, undefined, {
        timeoutMs: 20_000,
      });
      if (!Array.isArray(rows))
        throw new Error(`cftc ${key}: unexpected shape`);
      const weeks: CotWeek[] = [];
      for (const row of rows) {
        const time = Date.parse(row?.report_date_as_yyyy_mm_dd ?? "");
        const openInterest = num(row?.open_interest_all);
        if (!Number.isFinite(time) || openInterest === null) continue;
        weeks.push({
          time,
          openInterest,
          noncommercialLong: num(row?.noncomm_positions_long_all) ?? 0,
          noncommercialShort: num(row?.noncomm_positions_short_all) ?? 0,
          noncommercialSpread: num(row?.noncomm_postions_spread_all) ?? 0,
          commercialLong: num(row?.comm_positions_long_all) ?? 0,
          commercialShort: num(row?.comm_positions_short_all) ?? 0,
          nonreportableLong: num(row?.nonrept_positions_long_all) ?? 0,
          nonreportableShort: num(row?.nonrept_positions_short_all) ?? 0,
        });
      }
      if (weeks.length === 0) throw new Error(`cftc ${key}: no usable rows`);
      weeks.sort((a, b) => a.time - b.time);
      return {
        symbol: key,
        market: def.cotMarket ?? key,
        contractSize: def.contractSize,
        weeks,
      };
    });

    // Skip-on-fail, the provider's standard idiom: the disaggregated report is an
    // enrichment, so an outage there costs the extra trader classes and not the
    // board — the legacy weeks still render with `disaggregated` absent, which is
    // exactly why the field is optional. A legacy failure still rejects, since
    // that IS the answer.
    const disaggregated = cotDisaggCache
      .get(key, () => loadDisaggregated(key, code))
      .catch(() => null);
    const [positioning, extra] = await Promise.all([legacy, disaggregated]);
    if (!extra?.length) return positioning;

    const byTime = new Map(extra.map((week) => [week.time, week.data]));
    // A new object graph rather than a mutation: `positioning` is the cached
    // value and every frame on the board shares that one instance.
    return {
      ...positioning,
      weeks: positioning.weeks.map((week) => {
        const data = byTime.get(week.time);
        return data ? { ...week, disaggregated: data } : week;
      }),
    };
  }

  /**
   * Daily history of one listed volatility index (see {@link VOL_INDICES}).
   *
   * The metals counterpart of the VIX: GVZ is what the options market pays for
   * gold volatility, which is a different question from what gold has already
   * done — so it reads next to a price chart, not instead of one.
   */
  async getCommodityVolIndex(indexId: string): Promise<OfficialSeries> {
    const id = indexId.trim().toUpperCase();
    // Reject an id this provider doesn't publish before it reaches the network,
    // and name the ones it does — the generating agent's feedback loop.
    if (!VOL_INDICES[id])
      throw new Error(
        `metals: unknown volatility index "${indexId}" ` +
          `(known: ${Object.keys(VOL_INDICES).join(", ")})`,
      );
    return volCache.get(id, () => loadVolIndex(id));
  }

  async getGoldReserve(): Promise<GoldReserve> {
    return reserveCache.get("latest", async () => {
      // Each month is eight facility lines; pull a few months and keep the
      // newest complete report date.
      const url =
        `${RESERVE_URL}?sort=-record_date&page%5Bsize%5D=40` +
        `&fields=record_date,facility_desc,form_desc,location_desc,fine_troy_ounce_qty,book_value_amt`;
      const body = await fetchJson<{ data?: ReserveRow[] }>(url, undefined, {
        // fiscaldata is CORS-walled in the browser; the runtime relays it (the
        // host is already on the serve allowlist). In Node this is a no-op.
        proxied: true,
        timeoutMs: 20_000,
      });
      const rows = body?.data;
      if (!Array.isArray(rows) || rows.length === 0)
        throw new Error("treasury gold reserve: empty response");
      const latest = rows[0]?.record_date;
      const asOf = Date.parse(`${latest}T00:00:00Z`);
      if (!latest || !Number.isFinite(asOf))
        throw new Error("treasury gold reserve: no record date");
      const entries: GoldReserveEntry[] = [];
      for (const row of rows) {
        if (row?.record_date !== latest) continue;
        const ounces = num(row?.fine_troy_ounce_qty);
        if (ounces === null || ounces <= 0) continue;
        entries.push({
          facility: row.facility_desc ?? "Unknown facility",
          form: row.form_desc ?? "Gold",
          location: row.location_desc ?? "Unknown location",
          ounces,
          bookValueUsd: num(row?.book_value_amt) ?? 0,
        });
      }
      if (entries.length === 0)
        throw new Error("treasury gold reserve: no usable rows");
      entries.sort((a, b) => b.ounces - a.ounces);
      return {
        asOf,
        totalOunces: entries.reduce((sum, e) => sum + e.ounces, 0),
        totalBookValueUsd: entries.reduce((sum, e) => sum + e.bookValueUsd, 0),
        entries,
      };
    });
  }

  async getTokenizedGold(): Promise<TokenizedGold[]> {
    const tokens = await tokenCache.get("markets", async () => {
      const url = `${COINGECKO_URL}?vs_currency=usd&ids=pax-gold,tether-gold&price_change_percentage=24h`;
      const rows = await fetchJson<CoinGeckoMarket[]>(url, undefined, {
        timeoutMs: 12_000,
      });
      if (!Array.isArray(rows) || rows.length === 0)
        throw new Error("coingecko tokenized gold: empty response");
      return rows
        .map((row): TokenizedGold | null => {
          const price = num(row?.current_price);
          if (!row?.id || price === null || price <= 0) return null;
          return {
            id: row.id,
            symbol: (row.symbol ?? row.id).toUpperCase(),
            name: row.name ?? row.id,
            price,
            changePct: num(row?.price_change_percentage_24h) ?? 0,
            marketCap: num(row?.market_cap) ?? 0,
            volume24h: num(row?.total_volume) ?? 0,
            ounces: num(row?.circulating_supply) ?? 0,
          };
        })
        .filter((t): t is TokenizedGold => t !== null)
        .sort((a, b) => b.marketCap - a.marketCap);
    });

    // Premium needs live spot; a spot failure just leaves the field absent
    // rather than dropping the token rows the caller can already render.
    const [spot] = await this.getMetalSpot(["XAU"]).catch(() => []);
    if (!spot) return tokens;
    return tokens.map((token) => ({
      ...token,
      premiumPct: ((token.price - spot.price) / spot.price) * 100,
    }));
  }
}
