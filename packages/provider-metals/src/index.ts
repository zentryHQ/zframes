import type {
  Capability,
  CotWeek,
  GoldReserve,
  GoldReserveEntry,
  MarketDataProvider,
  MetalHistory,
  MetalPositioning,
  MetalSpot,
  SeriesPoint,
  TokenizedGold,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

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
 *  - **Positioning** — the CFTC's own public-reporting Socrata dataset (legacy
 *    futures-only Commitments of Traders), weekly since 2010.
 *  - **Official reserve** — the U.S. Treasury's monthly gold-reserve status
 *    report (Fort Knox / West Point / Denver / NY Fed), via fiscaldata.
 *  - **Tokenized gold** — PAXG/XAUT from CoinGecko's free tier, so the crypto
 *    wrapper's premium to physical spot is visible on the same board.
 *
 * Only the Treasury call needs the runtime proxy (fiscaldata isn't reliably
 * browser-CORS-reachable and is already on the serve allowlist); the other four
 * hosts answer `Access-Control-Allow-Origin: *` and are fetched direct.
 */

const SPOT_URL = "https://api.gold-api.com/price";
const LBMA_URL = "https://prices.lbma.org.uk/json";
const COT_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const RESERVE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/gold_reserve";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";

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

export class MetalsProvider implements MarketDataProvider {
  readonly name = "metals";
  readonly capabilities: readonly Capability[] = [
    "metal-spot",
    "metal-history",
    "metal-positioning",
    "gold-reserve",
    "tokenized-gold",
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
    return cotCache.get(key, async () => {
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
        `&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=520`;
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
