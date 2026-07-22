import type {
  Candle,
  Capability,
  DayStats,
  FundingComparison,
  FundingPoint,
  FundingVenueRate,
  MarketDataProvider,
  OpenInterestEntry,
  Unsubscribe,
} from "@zframes/spec";
import { fetchJson } from "@zframes/data-primitives/fetch";
import { TtlCache } from "@zframes/data-primitives/cache";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";

interface AllMidsMessage {
  channel: string;
  data?: { mids?: Record<string, string> };
}

interface AssetCtx {
  markPx: string;
  prevDayPx: string;
  /** Open interest in base-asset units (string from the API). */
  openInterest: string;
  /** Predicted hourly funding rate, decimal (string from the API). */
  funding?: string;
  /** Trailing-24h notional volume, USD (string from the API). */
  dayNtlVlm?: string;
  /** Mark price's premium over the oracle price, decimal fraction (string from the API). */
  premium?: string;
  /** Oracle price the mark price is anchored to (string from the API). */
  oraclePx?: string;
  /** [bid, ask] impact prices at a fixed notional depth (strings from the API). */
  impactPxs?: [string, string];
}

interface PerpMeta {
  universe: Array<{ name: string }>;
}

interface FundingHistoryEntry {
  coin: string;
  fundingRate: string;
  time: number;
}

interface CandleEntry {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

/** `predictedFundings`: [coin, [[venue, info|null], …]][] across venues. */
type PredictedFundingInfo = {
  fundingRate: string;
  nextFundingTime: number;
  fundingIntervalHours?: number;
} | null;
type PredictedFundingsResp = Array<
  [string, Array<[string, PredictedFundingInfo]>]
>;
const VENUE_LABELS: Record<string, string> = {
  HlPerp: "Hyperliquid",
  BinPerp: "Binance",
  BybitPerp: "Bybit",
};

/**
 * HIP-3 builder-dex symbols are namespaced by Hyperliquid itself:
 * "xyz:TSLA", "km:US500", "vntl:OPENAI". The part before ":" is the dex;
 * plain symbols ("BTC") live on the default dex "".
 */
const dexOf = (symbol: string): string =>
  symbol.includes(":") ? symbol.split(":")[0] : "";

/**
 * Parse an optional numeric wire field; a missing or non-finite value both
 * collapse to `undefined` so a DayStats extra is simply omitted rather than
 * carrying a NaN.
 */
function optNum(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function info<T>(body: Record<string, unknown>): Promise<T> {
  // Routed through the shared helper for a request timeout + (Node) User-Agent;
  // a stalled connection rejects instead of wedging the polling hook.
  return fetchJson<T>(INFO_URL, undefined, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  });
}

// Hyperliquid is the busiest source (day-stats, OI, candles, funding all flow
// through one `info` endpoint) and was the only provider hitting the network
// uncached, so N frames on the same data fired N requests. These module-level
// TtlCaches give every method in-flight dedup + a freshness window: concurrent
// frames (and StrictMode's double-invoke) coalesce to one round-trip, and the
// TTL sits just UNDER each hook's poll interval so scheduled background polls
// still refresh while reloads/extra frames reuse the cache.
//
// Day-stats / OI are keyed by the SORTED symbol set so order variants collapse,
// while the three request shapes (undefined→"*" default universe, "<dex>:*"
// wildcard, concrete symbols) map to distinct keys — a precise-symbol frame
// never receives a whole-universe payload. Live snapshots aren't persisted
// (cold-start fresh, not from a stale blob); candles/funding persist so a cold
// reload paints last-known immediately.
const dayStatsCache = new TtlCache<Record<string, DayStats>>({
  namespace: "zframes:hyperliquid:daystats",
  ttlMs: 25_000,
});
const openInterestCache = new TtlCache<OpenInterestEntry[]>({
  namespace: "zframes:hyperliquid:oi",
  ttlMs: 25_000,
});
const candlesCache = new TtlCache<Candle[]>({
  namespace: "zframes:hyperliquid:candles",
  ttlMs: 55_000,
  persist: true,
});
const fundingCache = new TtlCache<Record<string, FundingPoint[]>>({
  namespace: "zframes:hyperliquid:funding",
  ttlMs: 4.5 * 60_000,
  persist: true,
});
// One cheap POST returns predicted funding for every coin across venues; a 5-min
// TTL sits under the hook poll (funding refreshes hourly-ish).
const fundingComparisonCache = new TtlCache<FundingComparison[]>({
  namespace: "zframes:hyperliquid:funding-comparison",
  ttlMs: 5 * 60_000,
});
const sortedKey = (symbols?: readonly string[]): string =>
  symbols ? [...symbols].sort().join(",") : "*";

/**
 * Free, no-API-key provider backed by Hyperliquid's public API.
 * - quote-stream: `allMids` WebSocket (one subscription per dex, lazily added
 *   when a requested symbol names a new HIP-3 dex)
 * - day-stats: `metaAndAssetCtxs` per dex; full default-dex universe when no
 *   symbols are given
 * - funding-history: `fundingHistory` per coin
 * - ohlcv: `candleSnapshot` (works for HIP-3 coins like "xyz:TSLA" directly)
 * - open-interest: `metaAndAssetCtxs` per dex (live, single-venue; no history)
 *
 * Perp mids/marks track but are not official exchange quotes (NBBO for
 * equities); fine for personal dashboards.
 */
export class HyperliquidProvider implements MarketDataProvider {
  readonly name = "hyperliquid";
  readonly capabilities: readonly Capability[] = [
    "quote-stream",
    "day-stats",
    "funding-history",
    "ohlcv",
    "open-interest",
    "funding-comparison",
  ];

  async getFundingComparison(): Promise<FundingComparison[]> {
    return fundingComparisonCache.get("all", async () => {
      const resp = await info<PredictedFundingsResp>({
        type: "predictedFundings",
      });
      if (!Array.isArray(resp))
        throw new Error("hyperliquid predictedFundings: unexpected shape");
      const out: FundingComparison[] = [];
      for (const entry of resp) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [coin, venueList] = entry;
        if (typeof coin !== "string" || !Array.isArray(venueList)) continue;
        const venues: FundingVenueRate[] = [];
        for (const vEntry of venueList) {
          if (!Array.isArray(vEntry) || vEntry.length < 2) continue;
          const [venue, meta] = vEntry;
          if (!meta) continue;
          const rawRate = parseFloat(meta.fundingRate);
          if (!Number.isFinite(rawRate)) continue;
          // Venues fund on different intervals (Hl 1h, Bin/Bybit 4–8h); use the
          // reported interval, else a per-venue default, to annualize comparably.
          const reported = Number(meta.fundingIntervalHours);
          const intervalHours =
            Number.isFinite(reported) && reported > 0
              ? reported
              : venue === "HlPerp"
                ? 1
                : 8;
          venues.push({
            venue: VENUE_LABELS[venue] ?? venue,
            rawRate,
            intervalHours,
            annualizedPct: rawRate * (8760 / intervalHours) * 100,
          });
        }
        // Need at least two venues for the cross-venue spread to mean anything.
        if (venues.length < 2) continue;
        const rates = venues.map((v) => v.annualizedPct);
        out.push({
          coin,
          venues,
          spreadPct: Math.max(...rates) - Math.min(...rates),
        });
      }
      return out
        .sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct))
        .slice(0, 80);
    });
  }

  private ws: WebSocket | null = null;
  private listeners = new Set<(mids: Record<string, number>) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  /** Dexes we want an allMids subscription for ("" = default dex). */
  private wantedDexes = new Set<string>([""]);
  /** Dexes actually subscribed on the current socket. */
  private subscribedDexes = new Set<string>();
  /** Latest mids across all dexes, merged. */
  private mergedMids: Record<string, number> = {};

  subscribeMids(
    onMids: (mids: Record<string, number>) => void,
    symbols?: readonly string[],
  ): Unsubscribe {
    this.listeners.add(onMids);
    for (const symbol of symbols ?? []) this.wantedDexes.add(dexOf(symbol));
    this.ensureSocket();
    this.subscribeMissingDexes();
    return () => {
      this.listeners.delete(onMids);
      if (this.listeners.size === 0) this.teardown();
    };
  }

  getDayStats(symbols?: string[]): Promise<Record<string, DayStats>> {
    return dayStatsCache.get(sortedKey(symbols), () =>
      this.fetchDayStats(symbols),
    );
  }

  private async fetchDayStats(
    symbols?: string[],
  ): Promise<Record<string, DayStats>> {
    // Three request shapes, all routed through `metaAndAssetCtxs` per dex:
    //   • no symbols           → the default-dex universe (crypto)
    //   • "<dex>:*" wildcard   → that dex's *entire* universe (e.g. "xyz:*"
    //                            for every HIP-3 equity) — there's otherwise no
    //                            way to enumerate a dex without naming symbols
    //   • concrete symbols     → just those, grouped by their dex
    const wholeDexes = new Set<string>();
    const concrete = new Set<string>();
    if (!symbols) {
      wholeDexes.add("");
    } else {
      for (const s of symbols) {
        if (s.endsWith(":*")) wholeDexes.add(s.slice(0, -2));
        else concrete.add(s);
      }
    }
    const dexes = new Set<string>(wholeDexes);
    for (const s of concrete) dexes.add(dexOf(s));

    const out: Record<string, DayStats> = {};
    await Promise.all(
      [...dexes].map(async (dex) => {
        const body: Record<string, unknown> = { type: "metaAndAssetCtxs" };
        if (dex) body.dex = dex;
        const [meta, ctxs] = await info<[PerpMeta, AssetCtx[]]>(body);
        const wholeDex = wholeDexes.has(dex);
        meta.universe.forEach((asset, i) => {
          if (!wholeDex && !concrete.has(asset.name)) return;
          const ctx = ctxs[i];
          if (!ctx) return;
          const markPx = Number(ctx.markPx);
          const prevDayPx = Number(ctx.prevDayPx);
          if (!Number.isFinite(markPx) || !Number.isFinite(prevDayPx)) return;
          const stat: DayStats = {
            markPx,
            prevDayPx,
            changePct: prevDayPx ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0,
          };
          // Additive extras straight off the same AssetCtx — funding, 24h
          // notional volume, mark-vs-oracle premium/oracle price, and the
          // bid/ask impact prices. Each is independently optional so one
          // missing/malformed field never drops the whole row.
          const funding = optNum(ctx.funding);
          const dayNtlVlm = optNum(ctx.dayNtlVlm);
          const premium = optNum(ctx.premium);
          const oraclePx = optNum(ctx.oraclePx);
          const impactBid = ctx.impactPxs
            ? optNum(ctx.impactPxs[0])
            : undefined;
          const impactAsk = ctx.impactPxs
            ? optNum(ctx.impactPxs[1])
            : undefined;
          if (funding !== undefined) stat.funding = funding;
          if (dayNtlVlm !== undefined) stat.dayNtlVlm = dayNtlVlm;
          if (premium !== undefined) stat.premium = premium;
          if (oraclePx !== undefined) stat.oraclePx = oraclePx;
          if (impactBid !== undefined && impactAsk !== undefined)
            stat.impactPxs = [impactBid, impactAsk];
          out[asset.name] = stat;
        });
      }),
    );
    return out;
  }

  getOpenInterest(symbols?: string[]): Promise<OpenInterestEntry[]> {
    return openInterestCache.get(sortedKey(symbols), () =>
      this.fetchOpenInterest(symbols),
    );
  }

  private async fetchOpenInterest(
    symbols?: string[],
  ): Promise<OpenInterestEntry[]> {
    // Same `metaAndAssetCtxs`-per-dex resolution as getDayStats; we read
    // `openInterest` (base units) × `markPx` for USD notional. Live snapshot
    // only — Hyperliquid exposes no OI history endpoint.
    const wholeDexes = new Set<string>();
    const concrete = new Set<string>();
    if (!symbols) {
      wholeDexes.add("");
    } else {
      for (const s of symbols) {
        if (s.endsWith(":*")) wholeDexes.add(s.slice(0, -2));
        else concrete.add(s);
      }
    }
    const dexes = new Set<string>(wholeDexes);
    for (const s of concrete) dexes.add(dexOf(s));

    const out: OpenInterestEntry[] = [];
    await Promise.all(
      [...dexes].map(async (dex) => {
        const body: Record<string, unknown> = { type: "metaAndAssetCtxs" };
        if (dex) body.dex = dex;
        const [meta, ctxs] = await info<[PerpMeta, AssetCtx[]]>(body);
        const wholeDex = wholeDexes.has(dex);
        meta.universe.forEach((asset, i) => {
          if (!wholeDex && !concrete.has(asset.name)) return;
          const ctx = ctxs[i];
          if (!ctx) return;
          const markPx = Number(ctx.markPx);
          const oi = Number(ctx.openInterest);
          if (!Number.isFinite(markPx) || !Number.isFinite(oi)) return;
          out.push({ symbol: asset.name, openInterestUsd: oi * markPx });
        });
      }),
    );
    return out.sort((a, b) => b.openInterestUsd - a.openInterestUsd);
  }

  getFundingHistory(
    symbols: string[],
    startTimeMs: number,
  ): Promise<Record<string, FundingPoint[]>> {
    return fundingCache.get(
      `${[...symbols].sort().join(",")}|${startTimeMs}`,
      () => this.fetchFundingHistory(symbols, startTimeMs),
    );
  }

  private async fetchFundingHistory(
    symbols: string[],
    startTimeMs: number,
  ): Promise<Record<string, FundingPoint[]>> {
    const results = await Promise.all(
      symbols.map(async (coin) => {
        const entries = await info<FundingHistoryEntry[]>({
          type: "fundingHistory",
          coin,
          startTime: startTimeMs,
        });
        const points: FundingPoint[] = entries
          .map((entry) => ({
            time: entry.time,
            fundingRate: Number(entry.fundingRate),
          }))
          .filter(
            (point) =>
              Number.isFinite(point.fundingRate) && Number.isFinite(point.time),
          );
        return [coin, points] as const;
      }),
    );
    return Object.fromEntries(results);
  }

  getCandles(
    symbol: string,
    interval: string,
    startTimeMs: number,
  ): Promise<Candle[]> {
    return candlesCache.get(`${symbol}|${interval}|${startTimeMs}`, () =>
      this.fetchCandles(symbol, interval, startTimeMs),
    );
  }

  private async fetchCandles(
    symbol: string,
    interval: string,
    startTimeMs: number,
  ): Promise<Candle[]> {
    const entries = await info<CandleEntry[]>({
      type: "candleSnapshot",
      req: { coin: symbol, interval, startTime: startTimeMs },
    });
    return entries.map((entry) => ({
      time: entry.t,
      open: Number(entry.o),
      high: Number(entry.h),
      low: Number(entry.l),
      close: Number(entry.c),
      volume: Number(entry.v),
    }));
  }

  private ensureSocket() {
    if (this.ws) return;
    this.closedByUser = false;
    this.subscribedDexes = new Set();
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this.subscribeMissingDexes();
    };
    ws.onmessage = (event) => {
      let msg: AllMidsMessage;
      try {
        msg = JSON.parse(String(event.data)) as AllMidsMessage;
      } catch {
        return;
      }
      if (msg.channel !== "allMids" || !msg.data?.mids) return;
      // Each dex subscription sends its own mids map; merge so listeners
      // always see one map covering every subscribed dex.
      for (const [symbol, px] of Object.entries(msg.data.mids))
        this.mergedMids[symbol] = Number(px);
      for (const listener of this.listeners) listener(this.mergedMids);
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.closedByUser && this.listeners.size > 0) {
        this.reconnectTimer = setTimeout(() => this.ensureSocket(), 2_000);
      }
    };
  }

  private subscribeMissingDexes() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const dex of this.wantedDexes) {
      if (this.subscribedDexes.has(dex)) continue;
      const subscription: Record<string, unknown> = { type: "allMids" };
      if (dex) subscription.dex = dex;
      ws.send(JSON.stringify({ method: "subscribe", subscription }));
      this.subscribedDexes.add(dex);
    }
  }

  private teardown() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.subscribedDexes = new Set();
    this.mergedMids = {};
  }
}
