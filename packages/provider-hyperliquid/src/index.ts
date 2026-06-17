import type {
  Candle,
  Capability,
  DayStats,
  FundingPoint,
  MarketDataProvider,
  Unsubscribe,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";

interface AllMidsMessage {
  channel: string;
  data?: { mids?: Record<string, string> };
}

interface AssetCtx {
  markPx: string;
  prevDayPx: string;
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

/**
 * HIP-3 builder-dex symbols are namespaced by Hyperliquid itself:
 * "xyz:TSLA", "km:US500", "vntl:OPENAI". The part before ":" is the dex;
 * plain symbols ("BTC") live on the default dex "".
 */
const dexOf = (symbol: string): string =>
  symbol.includes(":") ? symbol.split(":")[0] : "";

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

/**
 * Free, no-API-key provider backed by Hyperliquid's public API.
 * - quote-stream: `allMids` WebSocket (one subscription per dex, lazily added
 *   when a requested symbol names a new HIP-3 dex)
 * - day-stats: `metaAndAssetCtxs` per dex; full default-dex universe when no
 *   symbols are given
 * - funding-history: `fundingHistory` per coin
 * - ohlcv: `candleSnapshot` (works for HIP-3 coins like "xyz:TSLA" directly)
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
  ];

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

  async getDayStats(symbols?: string[]): Promise<Record<string, DayStats>> {
    // Group requested symbols by dex; no symbols = default-dex universe.
    const dexes = symbols ? [...new Set(symbols.map(dexOf))] : [""];

    const out: Record<string, DayStats> = {};
    await Promise.all(
      dexes.map(async (dex) => {
        const body: Record<string, unknown> = { type: "metaAndAssetCtxs" };
        if (dex) body.dex = dex;
        const [meta, ctxs] = await info<[PerpMeta, AssetCtx[]]>(body);
        meta.universe.forEach((asset, i) => {
          if (symbols && !symbols.includes(asset.name)) return;
          const ctx = ctxs[i];
          if (!ctx) return;
          const markPx = Number(ctx.markPx);
          const prevDayPx = Number(ctx.prevDayPx);
          if (!Number.isFinite(markPx) || !Number.isFinite(prevDayPx)) return;
          out[asset.name] = {
            markPx,
            prevDayPx,
            changePct: prevDayPx ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0,
          };
        });
      }),
    );
    return out;
  }

  async getFundingHistory(
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

  async getCandles(
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
