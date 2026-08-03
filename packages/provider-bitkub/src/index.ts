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
// USD/THB is an ECB *daily* reference rate, so an hour-long TTL is already far
// finer than the source's resolution. Persisted: it survives a reload, which
// keeps the very first paint after startup denominated correctly.
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

interface FrankfurterResponse {
  rates?: Record<string, number>;
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
 * the live ECB reference rate on the way out — a `currency: "THB"` dashboard
 * then converts back for display at the same rate, so a baht board shows the
 * exchange's own baht numbers.
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
   * other), and it's the same keyless ECB source that provider serves, so the
   * two can't disagree.
   */
  private async usdThb(): Promise<number> {
    return fxCache.get("USD:THB", async () => {
      const body = await fetchJson<FrankfurterResponse>(FX_URL);
      const rate = num(body?.rates?.THB);
      if (rate <= 0) throw new Error("bitkub fx: no USD/THB rate");
      return rate;
    });
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
