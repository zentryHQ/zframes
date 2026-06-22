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
  FearGreedPoint,
  FinancialStress,
  FundingPoint,
  GlobalMarket,
  LightningStats,
  MacroSeries,
  MarketDataProvider,
  MempoolState,
  MiningPools,
  NationalDebt,
  NetworkHashrate,
  NewsItem,
  OpenInterestEntry,
  OptionsSummary,
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
} from "./types";

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
  useEffect(() => {
    if (!load) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setData(fallback);
    setIsLoading(true);
    const run = () => {
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
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
  const key = symbols ? symbols.join(",") : "*";
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
  const key = symbols ? symbols.join(",") : "*";
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
  const { data: adjustment, isLoading } = usePolled<DifficultyAdjustment | null>(
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
 * Community-ranked links + discussion (e.g. Hacker News), polled every few
 * minutes. An empty `query` returns the source's front page / top stories.
 * Aggregated Deribit options summary (put/call ratio, OI-by-strike, avg IV) for
 * one currency, polled every ~5 min. Two frames on the same currency share one
 * cached provider call.
 */
export function useSocial(
  query: string,
  limit: number,
export function useOptionsSummary(
  currency: string,
  refreshMs = 5 * 60_000,
): { items: NewsItem[]; isLoading: boolean } {
  const provider = useProviderFor("social");
  const { data: items, isLoading } = usePolled<NewsItem[]>(
    provider?.getSocial ? () => provider.getSocial!({ query, limit }) : null,
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
    [provider, query, limit, refreshMs],
    [provider, ccy, startTimeMs, resolutionSec, refreshMs],
    refreshMs,
  );
  return { items, isLoading };
  return { points, isLoading };
}
