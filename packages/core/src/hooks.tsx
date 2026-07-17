import {
  createContext,
  useContext,
  useEffect,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import type {
  BtcBlock,
  BtcFees,
  Candle,
  Capability,
  CoinMarketEntry,
  CoinMover,
  CompanyFacts,
  DayStats,
  DexVolumeEntry,
  DifficultyAdjustment,
  DollarIndex,
  FearGreedPoint,
  FinancialStress,
  FundingPoint,
  FxRate,
  GlobalMarket,
  LightningStats,
  MacroSeries,
  MarketDataProvider,
  MempoolState,
  MiningPools,
  NationalDebt,
  NetworkHashrate,
  NewsItem,
  OnchainExtras,
  OnchainValuation,
  OpenInterestEntry,
  OptionsSummary,
  Portfolio,
  PortfolioSource,
  ProtocolFeesEntry,
  ProtocolTvlEntry,
  ReferenceRate,
  SecCompanyFilings,
  SeriesPoint,
  ShortVolumeEntry,
  TreasuryAuction,
  TreasuryAverageRate,
  TvlEntry,
  VolatilityPoint,
  YieldCurve,
  StablecoinSupply,
  YieldPool,
  FeesOverview,
  FundingComparison,
  EthSupply,
  PredictionMarket,
  EtfFlows,
  TrendingCoin,
  MarketSector,
  NftCollection,
  DexPool,
  ChainActivity,
} from "@zframes/spec/types";

import { FrameVisibilityContext } from "./visibility";

const ProvidersContext = createContext<MarketDataProvider[]>([]);

export function FramesProvider({
  providers,
  children,
}: {
  providers: MarketDataProvider | MarketDataProvider[];
  children: ReactNode;
}) {
  const list = Array.isArray(providers) ? providers : [providers];
  return (
    <ProvidersContext.Provider value={list}>
      {children}
    </ProvidersContext.Provider>
  );
}

export function useProviders(): MarketDataProvider[] {
  return useContext(ProvidersContext);
}

/** First registered provider advertising the capability, or null. */
export function useProviderFor(
  capability: Capability,
): MarketDataProvider | null {
  const providers = useProviders();
  return providers.find((p) => p.capabilities.includes(capability)) ?? null;
}

/**
 * Shared engine for every poll-on-an-interval hook: fetch once, then re-fetch
 * on `refreshMs`, keep the last good value on error, and cancel cleanly on
 * unmount or dep change. Pass `load = null` when no provider covers the
 * capability — the hook resolves to `fallback` and stops loading.
 *
 * The effect keys off `deps`, not the `load` identity (which changes every
 * render); callers must list everything `load` closes over in `deps`, exactly
 * as a hand-written effect would.
 */
function usePolled<T>(
  load: (() => Promise<T>) | null,
  fallback: T,
  deps: DependencyList,
  refreshMs: number,
): { data: T; isLoading: boolean } {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  // Published by the enclosing card (FrameContent → ValidFrameCard). Null when a
  // frame renders outside a card (e.g. Storybook) — then polling never pauses.
  const visibility = useContext(FrameVisibilityContext);
  useEffect(() => {
    if (!load) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setData(fallback);
    setIsLoading(true);
    const run = () => {
      // Off-screen: skip the network round-trip + state update, keeping the last
      // good value on the card. The subscribe() below fires an immediate run()
      // the moment the frame scrolls back into view, so it refreshes on return
      // instead of waiting out the interval.
      if (visibility && !visibility.visibleRef.current) return;
      load()
        .then((next) => {
          if (cancelled) return;
          setData(next);
          setIsLoading(false);
        })
        .catch(() => {
          // keep last good value; the next poll retries
          if (!cancelled) setIsLoading(false);
        });
    };
    run();
    // ±15% jitter on each interval so many dashboards running this same code
    // don't poll the public APIs in lockstep.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          run();
          schedule();
        },
        refreshMs * (0.85 + Math.random() * 0.3),
      );
    };
    schedule();
    const unsubscribe = visibility?.subscribe((visible) => {
      if (visible && !cancelled) run();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, isLoading };
}

/** Live mid prices for the given symbols, streamed from a quote-stream provider. */
export function useMidsState(symbols: readonly string[]): {
  mids: Record<string, number>;
  isLoading: boolean;
} {
  const provider = useProviderFor("quote-stream");
  const [mids, setMids] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const key = symbols.join(",");
  useEffect(() => {
    const wanted = key.split(",").filter(Boolean);
    setMids({});
    if (!provider?.subscribeMids || wanted.length === 0) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    let received = false;
    setIsLoading(true);
    const timeout = setTimeout(() => {
      if (!cancelled && !received) setIsLoading(false);
    }, 8_000);
    const unsubscribe = provider.subscribeMids((all) => {
      if (cancelled) return;
      received = true;
      clearTimeout(timeout);
      setIsLoading(false);
      setMids((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const symbol of wanted) {
          const value = all[symbol];
          if (value !== undefined) {
            next[symbol] = value;
            if (value !== prev[symbol]) changed = true;
          }
        }
        if (Object.keys(prev).length !== Object.keys(next).length)
          changed = true;
        return changed ? next : prev;
      });
    }, wanted);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [provider, key]);
  return { mids, isLoading };
}

/** Live mid prices for the given symbols, streamed from a quote-stream provider. */
export function useMids(symbols: readonly string[]): Record<string, number> {
  return useMidsState(symbols).mids;
}

/**
 * 24h stats per symbol, polled on an interval. Pass no symbols (undefined)
 * for the provider's full universe — used by market-overview style frames.
 */
export function useDayStatsState(
  symbols?: readonly string[],
  refreshMs = 30_000,
): { stats: Record<string, DayStats>; isLoading: boolean } {
  const provider = useProviderFor("day-stats");
  // Sorted so order-variant symbol tuples (["ETH","BTC"] vs ["BTC","ETH"])
  // collapse to one effect identity here AND one provider cache key downstream.
  const key = symbols ? [...symbols].sort().join(",") : "*";
  const wanted = key === "*" ? undefined : key.split(",").filter(Boolean);
  const { data: stats, isLoading } = usePolled<Record<string, DayStats>>(
    provider?.getDayStats ? () => provider.getDayStats!(wanted) : null,
    {},
    [provider, key, refreshMs],
    refreshMs,
  );
  return { stats, isLoading };
}

export function useDayStats(
  symbols?: readonly string[],
  refreshMs = 30_000,
): Record<string, DayStats> {
  return useDayStatsState(symbols, refreshMs).stats;
}

/**
 * Historical funding rates per symbol since `startTimeMs`, re-fetched on an
 * interval. Returns {} (and stays non-loading) if no provider covers
 * "funding-history" — the frame's empty state handles the rest.
 */
export function useFundingHistory(
  symbols: readonly string[],
  startTimeMs: number,
  refreshMs = 5 * 60_000,
): { history: Record<string, FundingPoint[]>; isLoading: boolean } {
  const provider = useProviderFor("funding-history");
  const key = symbols.join(",");
  const wanted = key.split(",").filter(Boolean);
  const { data: history, isLoading } = usePolled<
    Record<string, FundingPoint[]>
  >(
    provider?.getFundingHistory && wanted.length > 0
      ? () => provider.getFundingHistory!(wanted, startTimeMs)
      : null,
    {},
    [provider, key, startTimeMs, refreshMs],
    refreshMs,
  );
  return { history, isLoading };
}

/** OHLCV candles for one symbol, re-fetched on an interval. */
export function useCandles(
  symbol: string,
  interval: string,
  startTimeMs: number,
  refreshMs = 60_000,
): { candles: Candle[]; isLoading: boolean } {
  const provider = useProviderFor("ohlcv");
  const { data: candles, isLoading } = usePolled<Candle[]>(
    provider?.getCandles && symbol
      ? () => provider.getCandles!(symbol, interval, startTimeMs)
      : null,
    [],
    [provider, symbol, interval, startTimeMs, refreshMs],
    refreshMs,
  );
  return { candles, isLoading };
}

/**
 * OHLCV candles for several symbols at once (one provider call per symbol, in
 * parallel), re-fetched on an interval. Mirrors useFundingHistory's shape for
 * multi-series frames; a symbol whose fetch fails resolves to [] so one bad
 * symbol can't blank the whole chart.
 */
export function useCandlesMulti(
  symbols: readonly string[],
  interval: string,
  startTimeMs: number,
  refreshMs = 60_000,
): { candles: Record<string, Candle[]>; isLoading: boolean } {
  const provider = useProviderFor("ohlcv");
  const key = symbols.join(",");
  const wanted = key.split(",").filter(Boolean);
  const { data: candles, isLoading } = usePolled<Record<string, Candle[]>>(
    provider?.getCandles && wanted.length > 0
      ? async () => {
          const pairs = await Promise.all(
            wanted.map((symbol) =>
              provider.getCandles!(symbol, interval, startTimeMs)
                .then((c) => [symbol, c] as const)
                .catch(() => [symbol, [] as Candle[]] as const),
            ),
          );
          return Object.fromEntries(pairs);
        }
      : null,
    {},
    [provider, key, interval, startTimeMs, refreshMs],
    refreshMs,
  );
  return { candles, isLoading };
}

/** TVL per chain, polled slowly (TVL moves slowly). */
export function useTvlByChain(refreshMs = 10 * 60_000): {
  entries: TvlEntry[];
  isLoading: boolean;
} {
  const provider = useProviderFor("tvl");
  const { data: entries, isLoading } = usePolled<TvlEntry[]>(
    provider?.getTvlByChain ? () => provider.getTvlByChain!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/** Trailing-24h DEX volume per protocol, polled slowly (volume aggregates move slowly). */
export function useDexVolume(refreshMs = 10 * 60_000): {
  entries: DexVolumeEntry[];
  isLoading: boolean;
} {
  const provider = useProviderFor("dex-volume");
  const { data: entries, isLoading } = usePolled<DexVolumeEntry[]>(
    provider?.getDexVolume ? () => provider.getDexVolume!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/** Historical daily DEX volume per protocol slug, re-fetched on an interval. */
export function useDexVolumeHistory(
  slugs: readonly string[],
  refreshMs = 5 * 60_000,
): { history: Record<string, SeriesPoint[]>; isLoading: boolean } {
  const provider = useProviderFor("dex-volume");
  const key = slugs.join(",");
  const wanted = key.split(",").filter(Boolean);
  const { data: history, isLoading } = usePolled<Record<string, SeriesPoint[]>>(
    provider?.getDexVolumeHistory && wanted.length > 0
      ? () => provider.getDexVolumeHistory!(wanted)
      : null,
    {},
    [provider, key, refreshMs],
    refreshMs,
  );
  return { history, isLoading };
}

/** Current TVL per DeFi protocol, polled slowly. */
export function useProtocolTvl(refreshMs = 10 * 60_000): {
  entries: ProtocolTvlEntry[];
  isLoading: boolean;
} {
  const provider = useProviderFor("protocol-tvl");
  const { data: entries, isLoading } = usePolled<ProtocolTvlEntry[]>(
    provider?.getProtocolTvl ? () => provider.getProtocolTvl!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/** Historical TVL per protocol slug, re-fetched on an interval. */
export function useProtocolTvlHistory(
  slugs: readonly string[],
  refreshMs = 5 * 60_000,
): { history: Record<string, SeriesPoint[]>; isLoading: boolean } {
  const provider = useProviderFor("protocol-tvl");
  const key = slugs.join(",");
  const wanted = key.split(",").filter(Boolean);
  const { data: history, isLoading } = usePolled<Record<string, SeriesPoint[]>>(
    provider?.getProtocolTvlHistory && wanted.length > 0
      ? () => provider.getProtocolTvlHistory!(wanted)
      : null,
    {},
    [provider, key, refreshMs],
    refreshMs,
  );
  return { history, isLoading };
}

/** Trailing-24h protocol fees per protocol, polled slowly. */
export function useProtocolFees(refreshMs = 10 * 60_000): {
  entries: ProtocolFeesEntry[];
  isLoading: boolean;
} {
  const provider = useProviderFor("protocol-fees");
  const { data: entries, isLoading } = usePolled<ProtocolFeesEntry[]>(
    provider?.getProtocolFees ? () => provider.getProtocolFees!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/** Coin market-cap snapshots (descending), polled slowly (the source is rate-limited). */
export function useCoinMarkets(refreshMs = 10 * 60_000): {
  entries: CoinMarketEntry[];
  isLoading: boolean;
} {
  const provider = useProviderFor("coin-markets");
  const { data: entries, isLoading } = usePolled<CoinMarketEntry[]>(
    provider?.getCoinMarkets ? () => provider.getCoinMarkets!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/**
 * Broad multi-window coin movers (descending by mcap), polled every ~15 min
 * (Coinpaprika's free tier is rate-limited; the movers snapshot drifts slowly).
 */
export function useCoinMovers(
  limit = 300,
  refreshMs = 15 * 60_000,
): { entries: CoinMover[]; isLoading: boolean } {
  const provider = useProviderFor("coin-movers");
  const { data: entries, isLoading } = usePolled<CoinMover[]>(
    provider?.getCoinMovers ? () => provider.getCoinMovers!(limit) : null,
    [],
    [provider, limit, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/**
 * Live open interest per perp symbol (single venue), polled every ~30s. Pass no
 * symbols for the provider's full universe, or a "<dex>:*" wildcard for a whole
 * dex (e.g. "xyz:*" for every HIP-3 equity).
 */
export function useOpenInterest(
  symbols?: readonly string[],
  refreshMs = 30_000,
): { entries: OpenInterestEntry[]; isLoading: boolean } {
  const provider = useProviderFor("open-interest");
  // Sorted so order-variant symbol tuples (["ETH","BTC"] vs ["BTC","ETH"])
  // collapse to one effect identity here AND one provider cache key downstream.
  const key = symbols ? [...symbols].sort().join(",") : "*";
  const wanted = key === "*" ? undefined : key.split(",").filter(Boolean);
  const { data: entries, isLoading } = usePolled<OpenInterestEntry[]>(
    provider?.getOpenInterest ? () => provider.getOpenInterest!(wanted) : null,
    [],
    [provider, key, refreshMs],
    refreshMs,
  );
  return { entries, isLoading };
}

/**
 * Global market snapshot (total mcap, dominance), polled every ~15 min — the
 * CoinGecko source only refreshes the global endpoint about every 10 minutes
 * and dominance drifts over hours, so faster polling just burns rate-limit
 * tokens for an identical payload.
 */
export function useGlobalMarket(refreshMs = 15 * 60_000): {
  market: GlobalMarket | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("global-market");
  const { data: market, isLoading } = usePolled<GlobalMarket | null>(
    provider?.getGlobalMarket ? () => provider.getGlobalMarket!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { market, isLoading };
}

/** Fear & greed index history (most recent first), polled hourly. */
export function useFearGreed(
  limit = 30,
  refreshMs = 60 * 60_000,
): { points: FearGreedPoint[]; isLoading: boolean } {
  const provider = useProviderFor("sentiment");
  const { data: points, isLoading } = usePolled<FearGreedPoint[]>(
    provider?.getFearGreed ? () => provider.getFearGreed!(limit) : null,
    [],
    [provider, limit, refreshMs],
    refreshMs,
  );
  return { points, isLoading };
}

/** Official short-rate / repo reference rates, polled conservatively. */
export function useReferenceRates(refreshMs = 15 * 60_000): {
  rates: ReferenceRate[];
  isLoading: boolean;
} {
  const provider = useProviderFor("reference-rates");
  const { data: rates, isLoading } = usePolled<ReferenceRate[]>(
    provider?.getReferenceRates ? () => provider.getReferenceRates!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { rates, isLoading };
}

/** FX rates for `symbols` quoted against `base`, each with a short trend.
 *  Polled hourly by default — ECB publishes reference rates once a business
 *  day, so there's nothing faster to see. */
export function useFxRates(
  base: string,
  symbols: readonly string[],
  refreshMs = 60 * 60_000,
): { rates: FxRate[]; isLoading: boolean } {
  const provider = useProviderFor("fx-rates");
  const key = symbols.join(",");
  const { data: rates, isLoading } = usePolled<FxRate[]>(
    provider?.getFxRates
      ? () => provider.getFxRates!(base, [...symbols])
      : null,
    [],
    // `key` (the joined symbol list) drives re-fetch on config change; `symbols`
    // itself is a fresh array each render and would re-fire every time.
    [provider, base, key, refreshMs],
    refreshMs,
  );
  return { rates, isLoading };
}

/** Treasury average borrowing rates by security class. */
export function useTreasuryAverageRates(refreshMs = 6 * 60 * 60_000): {
  rates: TreasuryAverageRate[];
  isLoading: boolean;
} {
  const provider = useProviderFor("treasury-rates");
  const { data: rates, isLoading } = usePolled<TreasuryAverageRate[]>(
    provider?.getTreasuryAverageRates
      ? () => provider.getTreasuryAverageRates!()
      : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { rates, isLoading };
}

/** US Treasury daily par yield curve, polled slowly (updates once per business day). */
export function useYieldCurve(refreshMs = 6 * 60 * 60_000): {
  curve: YieldCurve | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("yield-curve");
  const { data: curve, isLoading } = usePolled<YieldCurve | null>(
    provider?.getYieldCurve ? () => provider.getYieldCurve!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { curve, isLoading };
}

/** Recent completed US Treasury auctions, polled slowly (auctions are scheduled, not real-time). */
export function useTreasuryAuctions(
  limit = 8,
  refreshMs = 6 * 60 * 60_000,
): { auctions: TreasuryAuction[]; isLoading: boolean } {
  const provider = useProviderFor("treasury-auctions");
  const { data: auctions, isLoading } = usePolled<TreasuryAuction[]>(
    provider?.getTreasuryAuctions
      ? () => provider.getTreasuryAuctions!(limit)
      : null,
    [],
    [provider, limit, refreshMs],
    refreshMs,
  );
  return { auctions, isLoading };
}

/** US total public debt outstanding + recent trend, polled daily (Debt to the Penny updates each business day). */
export function useNationalDebt(
  days = 180,
  refreshMs = 6 * 60 * 60_000,
): { debt: NationalDebt | null; isLoading: boolean } {
  const provider = useProviderFor("national-debt");
  const { data: debt, isLoading } = usePolled<NationalDebt | null>(
    provider?.getNationalDebt ? () => provider.getNationalDebt!(days) : null,
    null,
    [provider, days, refreshMs],
    refreshMs,
  );
  return { debt, isLoading };
}

/** OFR Financial Stress Index (latest + categories + trend), polled daily. */
export function useFinancialStress(refreshMs = 6 * 60 * 60_000): {
  stress: FinancialStress | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("financial-stress");
  const { data: stress, isLoading } = usePolled<FinancialStress | null>(
    provider?.getFinancialStress ? () => provider.getFinancialStress!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { stress, isLoading };
}

/** Official macroeconomic time series such as CPI or unemployment. */
export function useMacroSeries(
  seriesId: string,
  startYear: number,
  endYear: number,
  refreshMs = 12 * 60 * 60_000,
): { series: MacroSeries | null; isLoading: boolean } {
  const provider = useProviderFor("macro-series");
  const { data: series, isLoading } = usePolled<MacroSeries | null>(
    provider?.getMacroSeries && seriesId
      ? () => provider.getMacroSeries!(seriesId, startYear, endYear)
      : null,
    null,
    [provider, seriesId, startYear, endYear, refreshMs],
    refreshMs,
  );
  return { series, isLoading };
}

/**
 * SEC EDGAR company profile + recent filings, by ticker or CIK. Filings are
 * event-driven, so polling is slow by default (every 30 min).
 */
export function useCompanyFilings(
  tickerOrCik: string,
  refreshMs = 30 * 60_000,
): { data: SecCompanyFilings | null; isLoading: boolean } {
  const provider = useProviderFor("filings");
  const { data, isLoading } = usePolled<SecCompanyFilings | null>(
    provider?.getCompanyFilings && tickerOrCik
      ? () => provider.getCompanyFilings!(tickerOrCik)
      : null,
    null,
    [provider, tickerOrCik, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * SEC EDGAR XBRL headline financials, by ticker or CIK. Financials change only
 * on filings, so this polls slowly (every 12 h by default).
 */
export function useCompanyFacts(
  tickerOrCik: string,
  refreshMs = 12 * 60 * 60_000,
): { data: CompanyFacts | null; isLoading: boolean } {
  const provider = useProviderFor("fundamentals");
  const { data, isLoading } = usePolled<CompanyFacts | null>(
    provider?.getCompanyFacts && tickerOrCik
      ? () => provider.getCompanyFacts!(tickerOrCik)
      : null,
    null,
    [provider, tickerOrCik, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * FINRA daily reported short-sale volume per symbol. The report updates once a
 * day (next business day), so this polls slowly (every 6 h by default).
 */
export function useShortVolume(
  symbols: readonly string[],
  refreshMs = 6 * 60 * 60_000,
): { data: Record<string, ShortVolumeEntry>; isLoading: boolean } {
  const provider = useProviderFor("short-volume");
  const key = symbols.join(",");
  const wanted = key.split(",").filter(Boolean);
  const { data, isLoading } = usePolled<Record<string, ShortVolumeEntry>>(
    provider?.getShortVolume && wanted.length > 0
      ? () => provider.getShortVolume!(wanted)
      : null,
    {},
    [provider, key, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * Latest headlines from a named outlet feed (RSS), polled every few minutes.
 * Pass an empty `feed` to disable the fetch (e.g. a per-symbol feed with no
 * symbols selected) — the hook resolves to [] and stops loading.
 */
export function useNews(
  feed: string,
  symbols: readonly string[] | undefined,
  limit: number,
  refreshMs = 5 * 60_000,
): { items: NewsItem[]; isLoading: boolean } {
  const provider = useProviderFor("news");
  const symbolKey = symbols ? symbols.join(",") : "";
  const { data: items, isLoading } = usePolled<NewsItem[]>(
    provider?.getNews && feed
      ? () =>
          provider.getNews!({
            feed,
            symbols: symbolKey ? symbolKey.split(",") : undefined,
            limit,
          })
      : null,
    [],
    [provider, feed, symbolKey, limit, refreshMs],
    refreshMs,
  );
  return { items, isLoading };
}

/** Recommended Bitcoin on-chain fee tiers (sat/vB), polled every ~30s. */
export function useBtcFees(refreshMs = 30_000): {
  fees: BtcFees | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("btc-fees");
  const { data: fees, isLoading } = usePolled<BtcFees | null>(
    provider?.getBtcFees ? () => provider.getBtcFees!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { fees, isLoading };
}

/** Current Bitcoin mempool congestion + projected blocks, polled every ~15s. */
export function useMempoolState(refreshMs = 15_000): {
  state: MempoolState | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("btc-mempool");
  const { data: state, isLoading } = usePolled<MempoolState | null>(
    provider?.getMempoolState ? () => provider.getMempoolState!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { state, isLoading };
}

/** Most recently mined Bitcoin blocks (newest first), polled every ~30s. */
export function useBtcBlocks(
  limit = 8,
  refreshMs = 30_000,
): { blocks: BtcBlock[]; isLoading: boolean } {
  const provider = useProviderFor("btc-blocks");
  const { data: blocks, isLoading } = usePolled<BtcBlock[]>(
    provider?.getBtcBlocks ? () => provider.getBtcBlocks!(limit) : null,
    [],
    [provider, limit, refreshMs],
    refreshMs,
  );
  return { blocks, isLoading };
}

/** Bitcoin network hashrate + difficulty over a window, polled every ~30 min. */
export function useNetworkHashrate(
  window = "1y",
  refreshMs = 30 * 60_000,
): { data: NetworkHashrate | null; isLoading: boolean } {
  const provider = useProviderFor("btc-hashrate");
  const { data, isLoading } = usePolled<NetworkHashrate | null>(
    provider?.getNetworkHashrate
      ? () => provider.getNetworkHashrate!(window)
      : null,
    null,
    [provider, window, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/** Countdown to the next Bitcoin difficulty retarget, polled every ~60s. */
export function useDifficultyAdjustment(refreshMs = 60_000): {
  adjustment: DifficultyAdjustment | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("btc-difficulty");
  const { data: adjustment, isLoading } =
    usePolled<DifficultyAdjustment | null>(
      provider?.getDifficultyAdjustment
        ? () => provider.getDifficultyAdjustment!()
        : null,
      null,
      [provider, refreshMs],
      refreshMs,
    );
  return { adjustment, isLoading };
}

/** Bitcoin mining-pool dominance over a window, polled every ~5 min. */
export function useMiningPools(
  window = "1w",
  refreshMs = 5 * 60_000,
): { pools: MiningPools | null; isLoading: boolean } {
  const provider = useProviderFor("mining-pools");
  const { data: pools, isLoading } = usePolled<MiningPools | null>(
    provider?.getMiningPools ? () => provider.getMiningPools!(window) : null,
    null,
    [provider, window, refreshMs],
    refreshMs,
  );
  return { pools, isLoading };
}

/** Lightning Network summary stats, polled every ~30 min (updates ~daily). */
export function useLightningStats(refreshMs = 30 * 60_000): {
  stats: LightningStats | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("lightning-stats");
  const { data: stats, isLoading } = usePolled<LightningStats | null>(
    provider?.getLightningStats ? () => provider.getLightningStats!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { stats, isLoading };
}

/**
 * Aggregated Deribit options summary (put/call ratio, OI-by-strike, avg IV) for
 * one currency, polled every ~5 min. Two frames on the same currency share one
 * cached provider call.
 */
export function useOptionsSummary(
  currency: string,
  refreshMs = 5 * 60_000,
): { summary: OptionsSummary | null; isLoading: boolean } {
  const provider = useProviderFor("options-summary");
  const ccy = (currency || "BTC").toUpperCase();
  const { data: summary, isLoading } = usePolled<OptionsSummary | null>(
    provider?.getOptionsSummary ? () => provider.getOptionsSummary!(ccy) : null,
    null,
    [provider, ccy, refreshMs],
    refreshMs,
  );
  return { summary, isLoading };
}

/**
 * A connected account's portfolio (a keyed CEX account or an on-chain address),
 * polled on an interval. Routes to the first provider that advertises
 * "portfolio" and serves `source.kind`. Pass `source = null` (no source
 * configured yet) to resolve to null without loading — the frame renders its
 * connect-state instead.
 */
export function usePortfolio(
  source: PortfolioSource | null,
  refreshMs = 60_000,
): { portfolio: Portfolio | null; isLoading: boolean } {
  const providers = useProviders();
  const provider = source
    ? (providers.find(
        (p) =>
          !!p.getPortfolio &&
          p.capabilities.includes("portfolio") &&
          (p.portfolioKinds?.includes(source.kind) ?? true),
      ) ?? null)
    : null;
  const key = source ? `${source.kind}:${source.address ?? ""}` : "";
  const { data: portfolio, isLoading } = usePolled<Portfolio | null>(
    provider && source ? () => provider.getPortfolio!(source) : null,
    null,
    [provider, key, refreshMs],
    refreshMs,
  );
  return { portfolio, isLoading };
}

/** Deribit DVOL volatility-index history for one currency, polled every ~10 min. */
export function useVolatilityIndex(
  currency: string,
  startTimeMs: number,
  resolutionSec = 43_200,
  refreshMs = 10 * 60_000,
): { points: VolatilityPoint[]; isLoading: boolean } {
  const provider = useProviderFor("volatility-index");
  const ccy = (currency || "BTC").toUpperCase();
  const { data: points, isLoading } = usePolled<VolatilityPoint[]>(
    provider?.getVolatilityIndex
      ? () => provider.getVolatilityIndex!(ccy, startTimeMs, resolutionSec)
      : null,
    [],
    [provider, ccy, startTimeMs, resolutionSec, refreshMs],
    refreshMs,
  );
  return { points, isLoading };
}

/**
 * Bitcoin on-chain valuation (MVRV, MVRV Z-score, NUPL, realized price/cap)
 * with daily history. On-chain metrics update once a day, so this polls every
 * ~3h — several valuation/cycle frames share one cached provider fetch.
 */
export function useOnchainValuation(refreshMs = 3 * 60 * 60_000): {
  valuation: OnchainValuation | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("onchain-valuation");
  const { data: valuation, isLoading } = usePolled<OnchainValuation | null>(
    provider?.getOnchainValuation
      ? () => provider.getOnchainValuation!()
      : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { valuation, isLoading };
}

/**
 * Long daily close series for `asset` (default BTC) — the multi-year history the
 * compute-in-frame cycle multiples (Mayer, Pi Cycle, 2Y/4Y-MA, RSI) run over.
 * Polled every ~6h; frames derive their own moving averages from the series.
 */
export function useDailyCloseHistory(
  asset = "btc",
  refreshMs = 6 * 60 * 60_000,
): { history: SeriesPoint[]; isLoading: boolean } {
  const provider = useProviderFor("price-history-daily");
  const key = asset.toLowerCase();
  const { data: history, isLoading } = usePolled<SeriesPoint[]>(
    provider?.getDailyCloseHistory
      ? () => provider.getDailyCloseHistory!(key)
      : null,
    [],
    [provider, key, refreshMs],
    refreshMs,
  );
  return { history, isLoading };
}

/**
 * Bitcoin on-chain cycle oscillators (SOPR, Puell, Reserve Risk). The source
 * (bitcoin-data.com) is hard-capped at 10 req/hour, so this polls slowly (every
 * ~12h) and the provider fans all three metrics off one shared daily refresh.
 */
export function useOnchainExtras(refreshMs = 12 * 60 * 60_000): {
  extras: OnchainExtras | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("onchain-cycle-extras");
  const { data: extras, isLoading } = usePolled<OnchainExtras | null>(
    provider?.getOnchainExtras ? () => provider.getOnchainExtras!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { extras, isLoading };
}

/**
 * Synthetic US Dollar Index (DXY), computed from ECB reference rates. Polled
 * hourly by default — the source publishes once per business day, so there's
 * nothing faster to see.
 */
export function useDollarIndex(refreshMs = 60 * 60_000): {
  dxy: DollarIndex | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("dollar-index");
  const { data: dxy, isLoading } = usePolled<DollarIndex | null>(
    provider?.getDollarIndex ? () => provider.getDollarIndex!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { dxy, isLoading };
}

/** Total stablecoin supply + change + per-chain split, polled hourly (daily data). */
export function useStablecoinSupply(refreshMs = 60 * 60_000): {
  supply: StablecoinSupply | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("stablecoins");
  const { data: supply, isLoading } = usePolled<StablecoinSupply | null>(
    provider?.getStablecoinSupply
      ? () => provider.getStablecoinSupply!()
      : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { supply, isLoading };
}

/** DeFi yield pools (descending by TVL), polled every ~15 min (large payload). */
export function useYieldPools(refreshMs = 15 * 60_000): {
  pools: YieldPool[];
  isLoading: boolean;
} {
  const provider = useProviderFor("yields");
  const { data: pools, isLoading } = usePolled<YieldPool[]>(
    provider?.getYieldPools ? () => provider.getYieldPools!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { pools, isLoading };
}

/** Aggregate DeFi fees/revenue + trend, polled every ~10 min. */
export function useFeesOverview(refreshMs = 10 * 60_000): {
  fees: FeesOverview | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("fees-overview");
  const { data: fees, isLoading } = usePolled<FeesOverview | null>(
    provider?.getFeesOverview ? () => provider.getFeesOverview!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { fees, isLoading };
}

/** Cross-venue predicted funding per coin, polled every ~5 min. */
export function useFundingComparison(refreshMs = 5 * 60_000): {
  comparison: FundingComparison[];
  isLoading: boolean;
} {
  const provider = useProviderFor("funding-comparison");
  const { data: comparison, isLoading } = usePolled<FundingComparison[]>(
    provider?.getFundingComparison
      ? () => provider.getFundingComparison!()
      : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { comparison, isLoading };
}

/** Ethereum supply economics (burn/issuance/net growth/staking), polled every ~2 min. */
export function useEthSupply(refreshMs = 2 * 60_000): {
  supply: EthSupply | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("eth-supply");
  const { data: supply, isLoading } = usePolled<EthSupply | null>(
    provider?.getEthSupply ? () => provider.getEthSupply!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { supply, isLoading };
}

/** Prediction-market odds (top markets by volume), polled every ~5 min. */
export function usePredictionMarkets(
  limit = 12,
  refreshMs = 5 * 60_000,
): { markets: PredictionMarket[]; isLoading: boolean } {
  const provider = useProviderFor("prediction-markets");
  const { data: markets, isLoading } = usePolled<PredictionMarket[]>(
    provider?.getPredictionMarkets
      ? () => provider.getPredictionMarkets!(limit)
      : null,
    [],
    [provider, limit, refreshMs],
    refreshMs,
  );
  return { markets, isLoading };
}

/**
 * Spot-ETF flows for one asset ("btc" | "eth"), polled every ~6h (daily data).
 * Resolves to null (non-loading) if no provider covers "etf-flows".
 */
export function useEtfFlows(
  asset = "btc",
  refreshMs = 6 * 60 * 60_000,
): { flows: EtfFlows | null; isLoading: boolean } {
  const provider = useProviderFor("etf-flows");
  const key = asset.toLowerCase();
  const { data: flows, isLoading } = usePolled<EtfFlows | null>(
    provider?.getEtfFlows ? () => provider.getEtfFlows!(key) : null,
    null,
    [provider, key, refreshMs],
    refreshMs,
  );
  return { flows, isLoading };
}

/** Trending coins (by search interest), polled every ~10 min. */
export function useTrendingCoins(refreshMs = 10 * 60_000): {
  coins: TrendingCoin[];
  isLoading: boolean;
} {
  const provider = useProviderFor("trending-coins");
  const { data: coins, isLoading } = usePolled<TrendingCoin[]>(
    provider?.getTrendingCoins ? () => provider.getTrendingCoins!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { coins, isLoading };
}

/** Market sectors / categories with aggregate performance, polled every ~12 min. */
export function useSectorPerformance(refreshMs = 12 * 60_000): {
  sectors: MarketSector[];
  isLoading: boolean;
} {
  const provider = useProviderFor("sector-performance");
  const { data: sectors, isLoading } = usePolled<MarketSector[]>(
    provider?.getSectorPerformance
      ? () => provider.getSectorPerformance!()
      : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { sectors, isLoading };
}

/**
 * Blue-chip NFT collections (floor, 24h change, volume), polled hourly — floors
 * drift over hours and the source fans out ~10 rate-limited calls per refresh,
 * so there's nothing faster worth polling for.
 */
export function useNftMarket(refreshMs = 60 * 60_000): {
  collections: NftCollection[];
  isLoading: boolean;
} {
  const provider = useProviderFor("nft-market");
  const { data: collections, isLoading } = usePolled<NftCollection[]>(
    provider?.getNftMarket ? () => provider.getNftMarket!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { collections, isLoading };
}

/**
 * Trending/hot DEX pools for a network, polled every ~2 min (GeckoTerminal's
 * free tier is rate-limited and trending pools rotate over minutes).
 */
export function useDexPools(
  network = "eth",
  refreshMs = 2 * 60_000,
): { pools: DexPool[]; isLoading: boolean } {
  const provider = useProviderFor("dex-pools");
  const { data: pools, isLoading } = usePolled<DexPool[]>(
    provider?.getDexPools ? () => provider.getDexPools!(network) : null,
    [],
    [provider, network, refreshMs],
    refreshMs,
  );
  return { pools, isLoading };
}

/** Cross-chain network activity per L1, polled every ~5 min. */
export function useChainActivity(refreshMs = 5 * 60_000): {
  chains: ChainActivity[];
  isLoading: boolean;
} {
  const provider = useProviderFor("chain-activity");
  const { data: chains, isLoading } = usePolled<ChainActivity[]>(
    provider?.getChainActivity ? () => provider.getChainActivity!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { chains, isLoading };
}
