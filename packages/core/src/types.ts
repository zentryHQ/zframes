/** Data needs a frame can declare; providers advertise which they fulfill. */
export type Capability =
  | "quote-stream"
  | "day-stats"
  | "funding-history"
  | "ohlcv"
  | "tvl"
  | "sentiment"
  | "global-market"
  | "news"
  | "fundamentals"
  | "social";

export interface DayStats {
  markPx: number;
  prevDayPx: number;
  changePct: number;
}

/** One historical funding observation for a perp symbol. */
export interface FundingPoint {
  /** Epoch milliseconds. */
  time: number;
  /** Funding rate for the interval as a decimal, e.g. 0.0000125 = 0.00125%/h. */
  fundingRate: number;
}

/** One OHLCV candle. */
export interface Candle {
  /** Open time, epoch milliseconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Total value locked for one chain/protocol. */
export interface TvlEntry {
  name: string;
  tvl: number;
}

/** One fear & greed index observation. */
export interface FearGreedPoint {
  /** 0 (extreme fear) … 100 (extreme greed). */
  value: number;
  classification: string;
  /** Epoch milliseconds. */
  time: number;
}

/** Global crypto market snapshot. */
export interface GlobalMarket {
  totalMarketCapUsd: number;
  marketCapChangePct24h: number;
  /** Market-cap dominance per asset symbol (lowercase), as percentages. */
  dominance: Record<string, number>;
}

export type Unsubscribe = () => void;

/**
 * A data provider fulfills frame capabilities. Every data method is optional —
 * a provider implements the methods matching the capabilities it advertises,
 * and the host routes each frame's needs to the first provider covering them.
 *
 * Symbols are provider-native. Hyperliquid already namespaces HIP-3 builder
 * dexes ("xyz:TSLA", "km:US500"), so equity perps need no extra scheme.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: readonly Capability[];
  /**
   * Stream mid prices; frames filter what they need. `symbols` is a hint so
   * providers can lazily widen coverage (e.g. subscribe extra HIP-3 dexes).
   */
  subscribeMids?(
    onMids: (mids: Record<string, number>) => void,
    symbols?: readonly string[],
  ): Unsubscribe;
  /** 24h stats per symbol. Omitting `symbols` returns the full universe. */
  getDayStats?(symbols?: string[]): Promise<Record<string, DayStats>>;
  /** Historical funding rates since startTimeMs. */
  getFundingHistory?(
    symbols: string[],
    startTimeMs: number,
  ): Promise<Record<string, FundingPoint[]>>;
  /** OHLCV candles. `interval` is provider-native, e.g. "1m" | "1h" | "1d". */
  getCandles?(
    symbol: string,
    interval: string,
    startTimeMs: number,
  ): Promise<Candle[]>;
  /** Total value locked per chain, descending. */
  getTvlByChain?(): Promise<TvlEntry[]>;
  /** Fear & greed index history, most recent first. */
  getFearGreed?(limit?: number): Promise<FearGreedPoint[]>;
  /** Global market snapshot (total mcap, dominance). */
  getGlobalMarket?(): Promise<GlobalMarket>;
}
