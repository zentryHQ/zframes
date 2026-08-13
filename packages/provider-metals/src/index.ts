import type {
  Capability,
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
import { parseCsvRowsAsync } from "@zframes/data-primitives/csv";
import { fetchJson, fetchText } from "@zframes/data-primitives/fetch";
import {
  COT_URL,
  COT_WEEKS,
  cotCache,
  cotDisaggCache,
  loadDisaggregated,
  type CotRow,
} from "./cot";
import { FIX_WARMUP_MS, LBMA_CURRENCIES, historyFor, lastFix } from "./lbma";
import { METALS, num, wantedSymbols } from "./universe";

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
 *    history in the whole zframes fleet. (Loading lives in `./lbma`.)
 *  - **Positioning** — the CFTC's own public-reporting Socrata datasets, weekly:
 *    the legacy futures-only Commitments of Traders since 2010, enriched
 *    week-by-week with the **disaggregated** report (2006-06-13 onwards), which
 *    splits the legacy `commercial` bucket into producer/merchant hedgers and
 *    swap dealers and adds trader counts and concentration. (Constants and the
 *    disaggregated pipeline live in `./cot`.)
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
const RESERVE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/gold_reserve";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";
const CBOE_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices";

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

// Spot moves continuously and the endpoint is a tiny single-object payload, so
// the TTL sits just under the hook's 60s poll: reloads and sibling frames reuse
// one quote, background polls still refresh. Not persisted — a stale price
// rehydrated from a previous session would read as live.
const spotCache = new TtlCache<MetalSpot>({
  namespace: "zframes:metals:spot",
  ttlMs: 45_000,
  persist: false,
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
  // Worker-offloaded: the Cboe histories run ~90–160 KB — small next to the
  // Zillow/FHFA tables, but they arrive in a burst (one file per vol index).
  const rows = await parseCsvRowsAsync(csv);
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
