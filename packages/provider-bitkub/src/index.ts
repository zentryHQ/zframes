import type {
  Candle,
  Capability,
  DayStats,
  MarketDataProvider,
  OrderBook,
  OrderBookLevel,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE_URL = "https://api.bitkub.com";
/** ECB reference rates, keyless — the same source @zframes/provider-fx uses. */
const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB";
/** Intraday commercial rates, keyless but rate-limited (~61 requests/window). */
const FX_URL_FXRATESAPI =
  "https://api.fxratesapi.com/latest?base=USD&currencies=THB";
/**
 * CC0, no rate limits, USD-based. The pages.dev origin, NOT the jsDelivr mirror
 * of the same dataset — the CDN copy was observed a full day behind.
 */
const FX_URL_CURRENCY_API =
  "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
/**
 * The ECB's own data portal, which publishes everything against EUR — so a
 * USD/THB rate needs two series and a cross. Last resort for that reason.
 */
const FX_URL_ECB_THB =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.THB.EUR.SP00.A?format=jsondata&lastNObservations=2";
const FX_URL_ECB_USD =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&lastNObservations=2";

/**
 * Plausibility band for THB per 1 USD. Every price this provider emits is
 * divided by this number, so a wrong-but-finite rate silently corrupts the whole
 * board — worse than no data at all. The band is deliberately far wider than the
 * baht ever trades (it spent the 1990s near 25 and spiked to ~56 in the 1997
 * crisis; it has been 30–38 for years) but tight enough to catch every way a
 * source can hand back the wrong number: an inverted quote (USD per THB, ~0.03),
 * a EUR/USD-shaped cross that skipped the baht leg (~1.15), or a decimal slip
 * (~3.3 or ~334). Anything outside falls through to the next source.
 */
const FX_MIN = 10;
const FX_MAX = 100;
/** Bitkub quotes everything against Thai baht; there is no second quote asset. */
const QUOTE = "THB";
const DEFAULT_SYMBOL = "KUB";
const DEFAULT_DEPTH = 15;
/**
 * Candles requested per call. Bitkub's chart endpoint needs an explicit
 * from/to window (it rejects TradingView's `countback`), so the window is
 * computed from `Date.now()` on every call — a fixed `from` would silently
 * freeze the series once it outgrew the caller's point budget.
 */
const CANDLE_BARS = 300;

/** zframes' generic interval ids → Bitkub's TradingView resolution codes. */
const RESOLUTIONS: Record<string, { code: string; seconds: number }> = {
  "1m": { code: "1", seconds: 60 },
  "5m": { code: "5", seconds: 300 },
  "15m": { code: "15", seconds: 900 },
  "1h": { code: "60", seconds: 3_600 },
  "4h": { code: "240", seconds: 14_400 },
  "1d": { code: "1D", seconds: 86_400 },
};
const DEFAULT_INTERVAL = "1h";

// Bitkub's public API is keyless and CORS-open, so every call below runs
// browser-direct — no proxy hop. TTLs sit just under each hook's poll interval
// so background polls still refresh while a reload or a second frame on the
// same data reuses the cache. Not persisted: an exchange board, a book and an
// intraday candle set are all too short-lived to be worth reviving stale.
const statsCache = new TtlCache<Record<string, DayStats>>({
  namespace: "zframes:bitkub:daystats",
  ttlMs: 25_000,
});
// A book is the fastest-moving thing here; keep it barely cached so two frames
// on the same pair share one request without either showing a stale ladder.
const bookCache = new TtlCache<OrderBook>({
  namespace: "zframes:bitkub:book",
  ttlMs: 15_000,
});
const candlesCache = new TtlCache<Candle[]>({
  namespace: "zframes:bitkub:candles",
  ttlMs: 50_000,
});
// USD/THB comes from daily-published reference rates (only the FXRatesAPI
// fallback is intraday), so an hour-long TTL is already finer than the sources'
// resolution. Persisted for two reasons: it survives a reload, which keeps the
// very first paint after startup denominated correctly, and it gives
// stale-on-error something to fall back on if the whole FX chain is down.
const fxCache = new TtlCache<number>({
  namespace: "zframes:bitkub:usdthb",
  ttlMs: 60 * 60_000,
  persist: true,
});

/** Bitkub serves v1 numbers as JSON numbers and v3 numbers as strings. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise whatever the caller passed into a bare base ticker: "kub",
 * "KUB_THB" and "THB_KUB" all mean KUB. Frames deal in base tickers; the pair
 * spelling is this provider's business — and the two spellings are NOT
 * interchangeable on the wire (see `v3Pair`).
 */
function baseTicker(symbol: string): string {
  const upper = (symbol || DEFAULT_SYMBOL).toUpperCase().trim();
  const stripped = upper
    .replace(new RegExp(`^${QUOTE}_`), "")
    .replace(new RegExp(`_${QUOTE}$`), "");
  return stripped || DEFAULT_SYMBOL;
}

/**
 * v3 and the chart endpoint spell pairs base-first: KUB_THB. Passing a v1-style
 * THB_KUB to v3 does NOT error — `/api/market/depth?sym=THB_KUB` quietly returns
 * a different pair's book — so the spellings must never be crossed.
 */
function v3Pair(base: string): string {
  return `${base}_${QUOTE}`;
}

/** One row of the legacy `/api/market/ticker` map (values are JSON numbers). */
interface BitkubTickerRow {
  last?: number;
  percentChange?: number;
  quoteVolume?: number;
  isFrozen?: number;
}

type BitkubTickerMap = Record<string, BitkubTickerRow>;

/** `/api/v3/market/depth` — `[price, size]` tuples, best level first per side. */
interface BitkubDepthResponse {
  error?: number;
  result?: {
    asks?: unknown[][];
    bids?: unknown[][];
  };
}

/** `/tradingview/history` — TradingView UDF column arrays. */
interface BitkubHistoryResponse {
  s?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

/**
 * Frankfurter and FXRatesAPI happen to agree on shape: `{rates:{THB:number}}`
 * with an upper-case currency key. (FXRatesAPI adds `success`/`timestamp`, which
 * we ignore — a bad rate is caught by the plausibility band, not a flag.)
 */
interface RatesMapResponse {
  rates?: Record<string, number>;
}

/** currency-api keys by *lower-case* code, base first: `{usd:{thb:number}}`. */
interface CurrencyApiResponse {
  usd?: Record<string, number>;
}

/**
 * SDMX-JSON, as served by the ECB data portal. Observations live under a
 * positional series key (one series per request here, so always "0:0:0:0:0") and
 * are keyed by *observation index* as a string, value-first in a tuple.
 */
interface SdmxResponse {
  dataSets?: {
    series?: Record<string, { observations?: Record<string, unknown[]> }>;
  }[];
}

/** THB per 1 USD, or 0 when the source can't supply a usable number. */
interface FxSource {
  /** Names the source in the all-sources-failed error, so a dead link is findable. */
  name: string;
  load(): Promise<number>;
}

/**
 * Latest observation of a single-series SDMX response. The observation keys are
 * stringified indices ("0", "1", …) in publication order, so the newest print is
 * the highest key — not the first one the object happens to enumerate.
 */
function latestSdmxObservation(body: SdmxResponse | undefined): number {
  const series = body?.dataSets?.[0]?.series ?? {};
  const observations = Object.values(series)[0]?.observations ?? {};
  let bestIndex = -1;
  let bestValue = 0;
  for (const [index, tuple] of Object.entries(observations)) {
    const i = Number(index);
    const value = num(Array.isArray(tuple) ? tuple[0] : undefined);
    if (!Number.isFinite(i) || value <= 0 || i <= bestIndex) continue;
    bestIndex = i;
    bestValue = value;
  }
  return bestValue;
}

/**
 * USD/THB sources in preference order. Frankfurter stays first (it is what this
 * provider always used, so the healthy path is unchanged); the rest exist because
 * a single upstream outage otherwise killed every Bitkub card on the board.
 *
 * A source that throws — including a 429, which `fetchJson` surfaces as a
 * non-2xx error — simply hands over to the next one; nothing retries, so a
 * rate-limited source is asked once per TTL and never hammered.
 */
const FX_SOURCES: readonly FxSource[] = [
  {
    name: "frankfurter",
    load: async () =>
      num((await fetchJson<RatesMapResponse>(FX_URL))?.rates?.THB),
  },
  {
    name: "fxratesapi",
    load: async () =>
      num((await fetchJson<RatesMapResponse>(FX_URL_FXRATESAPI))?.rates?.THB),
  },
  {
    name: "currency-api",
    load: async () =>
      num(
        (await fetchJson<CurrencyApiResponse>(FX_URL_CURRENCY_API))?.usd?.thb,
      ),
  },
  {
    name: "ecb-cross",
    load: async () => {
      // EUR-based series, so USD/THB = (THB per EUR) ÷ (USD per EUR).
      const [thbPerEur, usdPerEur] = await Promise.all([
        fetchJson<SdmxResponse>(FX_URL_ECB_THB).then(latestSdmxObservation),
        fetchJson<SdmxResponse>(FX_URL_ECB_USD).then(latestSdmxObservation),
      ]);
      if (usdPerEur <= 0) return 0;
      return thbPerEur / usdPerEur;
    },
  },
];

/** Reject anything that would silently misprice the board (see FX_MIN/FX_MAX). */
function plausibleRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= FX_MIN && rate <= FX_MAX;
}

/**
 * Walk {@link FX_SOURCES} in order, returning the first plausible rate. Only
 * when every source has failed (or answered something implausible) does this
 * throw — and even then `fxCache`'s stale-on-error serves the last good rate if
 * there is one, so a board that has ever resolved a rate degrades to a slightly
 * stale one rather than to error cards. That mirrors how the core currency layer
 * degrades: a marginally old rate beats a dead card.
 */
async function loadUsdThb(): Promise<number> {
  const failures: string[] = [];
  for (const source of FX_SOURCES) {
    try {
      const rate = await source.load();
      if (plausibleRate(rate)) return rate;
      failures.push(`${source.name} implausible (${rate})`);
    } catch (error) {
      failures.push(
        `${source.name} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(`bitkub fx: no USD/THB rate — ${failures.join("; ")}`);
}

/** Cumulate size from the best level down, dropping malformed tuples. */
function toLevels(
  rows: unknown[][] | undefined,
  toUsd: (thb: number) => number,
): OrderBookLevel[] {
  let running = 0;
  const levels: OrderBookLevel[] = [];
  for (const row of rows ?? []) {
    if (!Array.isArray(row)) continue;
    const price = num(row[0]);
    const size = num(row[1]);
    if (price <= 0 || size <= 0) continue;
    running += size;
    // Price converts (it's money); size does not (it's a quantity of the base
    // asset, which no exchange rate touches).
    levels.push({ price: toUsd(price), size, cumulativeSize: running });
  }
  return levels;
}

/**
 * Free, no-API-key provider backed by Bitkub's public API — Thailand's largest
 * digital-asset exchange, and the venue where KUB (Bitkub Chain's gas token)
 * actually trades.
 *
 * It fulfils the SAME capabilities the existing sources do, so the existing
 * frames render Bitkub data unchanged; a frame reaches it by pinning
 * `source: "bitkub"` (capability routing is otherwise first-match, which would
 * always hand these to Hyperliquid). Bitkub quotes in Thai baht, but every
 * capability in this codebase is denominated in USD, so prices are converted at
 * a live USD/THB reference rate on the way out (see {@link FX_SOURCES}) — a
 * `currency: "THB"` dashboard then converts back for display at the same rate,
 * so a baht board shows the exchange's own baht numbers.
 * - day-stats: last price, 24h change and 24h volume per market.
 * - ohlcv: candles for one market, window anchored to now.
 * - order-book: a two-sided depth snapshot with cumulative size.
 */
export class BitkubProvider implements MarketDataProvider {
  readonly name = "bitkub";
  readonly capabilities: readonly Capability[] = [
    "day-stats",
    "ohlcv",
    "order-book",
  ];

  /**
   * THB per 1 USD. Fetched here rather than borrowed from the FX provider
   * because a provider is self-contained (nothing wires providers to each
   * other), and Frankfurter — the primary — is the same keyless ECB source that
   * provider serves, so the two can't disagree in the healthy case.
   *
   * The rate gates *every* number this provider emits, which made one upstream a
   * single point of failure for the whole venue: a Frankfurter outage used to
   * throw and take every Bitkub card with it. It now walks an ordered chain of
   * four keyless, CORS-open sources ({@link FX_SOURCES}) and sanity-checks the
   * result ({@link plausibleRate}) before trusting it.
   */
  private async usdThb(): Promise<number> {
    return fxCache.get("USD:THB", loadUsdThb);
  }

  async getDayStats(symbols?: string[]): Promise<Record<string, DayStats>> {
    const wanted = symbols?.length
      ? new Set(symbols.map((s) => baseTicker(s)))
      : null;
    const key = wanted ? [...wanted].sort().join(",") : "*";
    return statsCache.get(key, async () => {
      const [body, rate] = await Promise.all([
        fetchJson<BitkubTickerMap>(`${BASE_URL}/api/market/ticker`),
        this.usdThb(),
      ]);
      if (!body || typeof body !== "object")
        throw new Error("bitkub day stats: unexpected response shape");
      const toUsd = (thb: number) => thb / rate;
      const out: Record<string, DayStats> = {};
      for (const [pairKey, row] of Object.entries(body)) {
        // Every tradable Bitkub market is THB-quoted; ignore anything else the
        // map might grow, and skip frozen pairs — they can't be traded.
        if (!pairKey.startsWith(`${QUOTE}_`) || !row || row.isFrozen === 1)
          continue;
        const symbol = pairKey.slice(QUOTE.length + 1);
        if (!symbol || (wanted && !wanted.has(symbol))) continue;
        const last = num(row.last);
        const changePct = num(row.percentChange);
        // Bitkub reports the change, not the previous close; recover it so the
        // shape matches every other day-stats provider.
        const prevThb = changePct === -100 ? 0 : last / (1 + changePct / 100);
        out[symbol] = {
          markPx: toUsd(last),
          prevDayPx: toUsd(prevThb),
          changePct,
          dayNtlVlm: toUsd(num(row.quoteVolume)),
        };
      }
      return out;
    });
  }

  async getCandles(
    symbol = DEFAULT_SYMBOL,
    interval = DEFAULT_INTERVAL,
    startTimeMs?: number,
  ): Promise<Candle[]> {
    const base = baseTicker(symbol);
    const res = RESOLUTIONS[interval] ?? RESOLUTIONS[DEFAULT_INTERVAL];
    // A caller-supplied start is honoured, but capped to CANDLE_BARS worth of
    // history so one frame can't ask Bitkub for years of 1m candles.
    const to = Math.floor(Date.now() / 1000);
    const earliest = to - res.seconds * CANDLE_BARS;
    const from = startTimeMs
      ? Math.max(Math.floor(startTimeMs / 1000), earliest)
      : earliest;
    return candlesCache.get(`${base}:${res.code}:${from}`, async () => {
      const pair = v3Pair(base);
      const [body, rate] = await Promise.all([
        fetchJson<BitkubHistoryResponse>(
          `${BASE_URL}/tradingview/history?symbol=${pair}&resolution=${res.code}&from=${from}&to=${to}`,
        ),
        this.usdThb(),
      ]);
      // The UDF contract answers `s: "no_data"` for a valid pair with nothing in
      // the window — an empty series, not a failure.
      if (body?.s === "no_data") return [];
      if (body?.s !== "ok" || !Array.isArray(body.t))
        throw new Error(`bitkub candles ${pair}: ${body?.s ?? "bad response"}`);
      const { t, o, h, l, c, v } = body;
      return t.map((time, i) => ({
        time: time * 1000,
        open: num(o?.[i]) / rate,
        high: num(h?.[i]) / rate,
        low: num(l?.[i]) / rate,
        close: num(c?.[i]) / rate,
        // Volume is in the base asset, a quantity — not converted.
        volume: num(v?.[i]),
      }));
    });
  }

  async getOrderBook(
    symbol = DEFAULT_SYMBOL,
    depth = DEFAULT_DEPTH,
  ): Promise<OrderBook> {
    const base = baseTicker(symbol);
    const levels = Math.max(
      1,
      Math.min(Math.trunc(depth) || DEFAULT_DEPTH, 50),
    );
    return bookCache.get(`${base}:${levels}`, async () => {
      const pair = v3Pair(base);
      const [body, rate] = await Promise.all([
        fetchJson<BitkubDepthResponse>(
          `${BASE_URL}/api/v3/market/depth?sym=${pair}&lmt=${levels}`,
        ),
        this.usdThb(),
      ]);
      // v3 answers 200 with a non-zero `error` code for a bad pair rather than
      // an HTTP error, so the status check in fetchJson can't catch it.
      if (body?.error) throw new Error(`bitkub depth ${pair}: ${body.error}`);
      const toUsd = (thb: number) => thb / rate;
      const bids = toLevels(body?.result?.bids, toUsd);
      const asks = toLevels(body?.result?.asks, toUsd);
      const bestBid = bids[0]?.price ?? 0;
      const bestAsk = asks[0]?.price ?? 0;
      const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
      return {
        symbol: base,
        pair,
        bids,
        asks,
        mid,
        spreadPct: mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0,
      };
    });
  }
}
