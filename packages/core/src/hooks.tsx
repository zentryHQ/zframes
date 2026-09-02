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
  CompanyFactsHistory,
  AnalystRatings,
  CryptoAssetProfile,
  EarningsCalendarEntry,
  EarningsHistory,
  EquityFinancials,
  EquityProfile,
  InstitutionalOwnership,
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
  OptionsChain,
  OptionsSummary,
  Portfolio,
  PortfolioSource,
  ProtocolFeesEntry,
  ProtocolFundamentals,
  ProtocolTvlEntry,
  TokenUnlocks,
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
  OrderBook,
  MetalSpot,
  MetalHistory,
  MetalPositioning,
  GoldReserve,
  TokenizedGold,
  OfficialSeries,
  HomeValueIndex,
  RegionalHousingPrice,
} from "@zframes/spec/types";

import {
  areLiveUpdatesPaused,
  FrameVisibilityContext,
  isPageHidden,
  onLiveUpdatesPausedChange,
  onPageVisibilityChange,
} from "./visibility";

const ProvidersContext = createContext<MarketDataProvider[]>([]);

// ── Provider registry & capability routing ───────────────────────────────────

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

/**
 * The provider that should serve a capability, or null.
 *
 * Default is first-match by registration order. Pass `source` (a provider
 * `name`, e.g. "bitkub") to pin a specific one — that's how a frame sourced
 * from a second exchange reaches it at all, since first-match alone would
 * always hand the capability to the earlier provider. An unknown or
 * non-covering `source` falls back to first-match rather than rendering an
 * empty card, so a typo degrades to the default source instead of nothing.
 */
export function useProviderFor(
  capability: Capability,
  source?: string,
): MarketDataProvider | null {
  const providers = useProviders();
  const covering = providers.filter((p) => p.capabilities.includes(capability));
  if (source) {
    const pinned = covering.find(
      (p) => p.name.toLowerCase() === source.toLowerCase(),
    );
    if (pinned) return pinned;
  }
  return covering[0] ?? null;
}

/** Provider names that can serve a capability — what a `source` picker offers. */
export function useSourcesFor(capability: Capability): string[] {
  const providers = useProviders();
  return providers
    .filter((p) => p.capabilities.includes(capability))
    .map((p) => p.name);
}

// ── Polling engine ───────────────────────────────────────────────────────────

/**
 * Structural equality for the JSON-shaped payloads providers return. Anything
 * exotic (Map, Set, class instance, null-prototype object) falls back to
 * reference equality rather than being walked.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (a instanceof Date || b instanceof Date)
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }
  if (
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  )
    return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      deepEqual(left[key], right[key]),
  );
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
    // Capture the (now non-null) loader in a const so the hoisted `tick`
    // declaration below keeps the narrowing.
    const loadFn = load;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let errorStreak = 0;
    let skippedWhilePaused = false;
    // Every state write here goes through a value-diff: a poll whose payload is
    // structurally identical to the last one must not install a new identity,
    // or every frame re-renders and its memoized chart re-derives on a no-op.
    setData((prev) => (deepEqual(prev, fallback) ? prev : fallback));
    setIsLoading(true);
    // ±15% jitter on each delay so many dashboards running this same code don't
    // poll the public APIs in lockstep.
    const jitter = () => 0.85 + Math.random() * 0.3;
    const scheduleNext = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, delay * jitter());
    };
    function tick() {
      // Hidden tab/window: stop the loop OUTRIGHT rather than rescheduling it.
      // Unlike the off-screen case below there is no cadence worth keeping —
      // nothing can be seen, and a background tab that holds no timer at all is
      // the whole point. The onPageVisibilityChange subscription restarts it
      // with an immediate fetch on return, so the card is fresh when looked at.
      if (isPageHidden()) return;
      // Off-screen: skip the network round-trip + state update, keeping the last
      // good value on the card. Keep the loop alive on the normal cadence; the
      // subscribe() below fires an immediate tick the moment the frame scrolls
      // back into view, so it refreshes on return instead of waiting out the interval.
      if (visibility && !visibility.visibleRef.current) {
        scheduleNext(refreshMs);
        return;
      }
      // Host-paused (the embedding page is scrubbing the board): same shape as
      // off-screen — skip the fetch, keep the cadence. The pause subscription
      // below refires a skipped tick on resume, so a slow-cadence frame that
      // came due mid-scrub doesn't wait out its whole interval.
      if (areLiveUpdatesPaused()) {
        skippedWhilePaused = true;
        scheduleNext(refreshMs);
        return;
      }
      loadFn()
        .then((next) => {
          if (cancelled) return;
          errorStreak = 0;
          setData((prev) => (deepEqual(prev, next) ? prev : next));
          setIsLoading((loading) => (loading ? false : loading));
          scheduleNext(refreshMs);
        })
        .catch(() => {
          if (cancelled) return;
          // Keep the last good value, but don't wait out the full interval — a
          // transient first-fetch miss on a slow-poll frame (e.g. 6h) would
          // otherwise stick as an empty "no data" card until a manual reload.
          // Retry with a short exponential backoff. The cap scales with the
          // cadence (never below 60s, never above refreshMs): a flat 60s cap
          // meant a failing 6h frame hammered a throttled upstream ~360× its
          // normal rate — exactly when it was already rate-limiting us.
          setIsLoading((loading) => (loading ? false : loading));
          errorStreak += 1;
          const backoff = Math.min(
            3_000 * 2 ** (errorStreak - 1),
            Math.max(60_000, refreshMs / 10),
            refreshMs,
          );
          scheduleNext(backoff);
        });
    }
    tick();
    const unsubscribe = visibility?.subscribe((visible) => {
      if (visible && !cancelled) tick();
    });
    // Restart the (now-stopped) loop when the tab comes back. Also clear the
    // pending timer on the way OUT: the tab can be hidden mid-interval, and
    // without this the already-scheduled tick still fires once behind the
    // scenes before the `isPageHidden()` guard above can stand it down.
    const unsubscribePage = onPageVisibilityChange((hidden) => {
      if (cancelled) return;
      if (hidden) clearTimeout(timer);
      else tick();
    });
    const unsubscribePaused = onLiveUpdatesPausedChange((paused) => {
      if (cancelled || paused || !skippedWhilePaused) return;
      skippedWhilePaused = false;
      tick();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
      unsubscribePage();
      unsubscribePaused();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, isLoading };
}

// ── Streaming quotes (mids) ──────────────────────────────────────────────────

/** Live mid prices for the given symbols, streamed from a quote-stream provider. */
export function useMidsState(symbols: readonly string[]): {
  mids: Record<string, number>;
  isLoading: boolean;
} {
  const provider = useProviderFor("quote-stream");
  const [mids, setMids] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Published by the enclosing card (FrameContent → ValidFrameCard), exactly as
  // in usePolled: an off-screen card must not re-render + redraw its chart on
  // every stream tick. The stream stays subscribed (cheap — providers fan out
  // from one socket/timer), but state stops updating; the first tick after the
  // card scrolls back into view repaints it.
  const visibility = useContext(FrameVisibilityContext);
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
      // A tick that changes nothing must cost zero state updates, so this only
      // fires while still loading rather than on every message.
      setIsLoading((loading) => (loading ? false : loading));
      if (visibility && !visibility.visibleRef.current) return;
      // Host-paused: drop the state update (the stream stays subscribed); the
      // next message after resume repaints — mids tick sub-second, so the gap
      // closes itself without a resume hook.
      if (areLiveUpdatesPaused()) return;
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
  }, [provider, key, visibility]);
  return { mids, isLoading };
}

/** Live mid prices for the given symbols, streamed from a quote-stream provider. */
export function useMids(symbols: readonly string[]): Record<string, number> {
  return useMidsState(symbols).mids;
}

// ── Crypto market data ───────────────────────────────────────────────────────

/**
 * 24h stats per symbol, polled on an interval. Pass no symbols (undefined)
 * for the provider's full universe — used by market-overview style frames.
 */
export function useDayStatsState(
  symbols?: readonly string[],
  refreshMs = 30_000,
  source?: string,
): { stats: Record<string, DayStats>; isLoading: boolean } {
  const provider = useProviderFor("day-stats", source);
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
  source?: string,
): Record<string, DayStats> {
  return useDayStatsState(symbols, refreshMs, source).stats;
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
  source?: string,
): { candles: Candle[]; isLoading: boolean } {
  const provider = useProviderFor("ohlcv", source);
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
 * Order-book snapshot for one base asset, polled every ~20 s — the fastest
 * cadence here, since a depth ladder is stale almost immediately.
 */
export function useOrderBook(
  symbol = "KUB",
  depth = 15,
  refreshMs = 20_000,
  source?: string,
): { book: OrderBook | null; isLoading: boolean } {
  const provider = useProviderFor("order-book", source);
  const { data: book, isLoading } = usePolled<OrderBook | null>(
    provider?.getOrderBook ? () => provider.getOrderBook!(symbol, depth) : null,
    null,
    [provider, symbol, depth, refreshMs],
    refreshMs,
  );
  return { book, isLoading };
}

/**
 * Identity, supply and valuation snapshot for one crypto asset. Supply and
 * rank move slowly but price does not, and the card shows both, so this polls
 * on a quote-ish cadence (~5 min) rather than a filing one.
 */
export function useCryptoProfile(
  asset: string,
  source?: string,
  refreshMs = 5 * 60_000,
): { profile: CryptoAssetProfile | null; isLoading: boolean } {
  const provider = useProviderFor("crypto-profile", source);
  const { data: profile, isLoading } = usePolled<CryptoAssetProfile | null>(
    provider?.getCryptoProfile && asset
      ? () => provider.getCryptoProfile!(asset)
      : null,
    null,
    [provider, asset, refreshMs],
    refreshMs,
  );
  return { profile, isLoading };
}

// ── Derivatives & options ────────────────────────────────────────────────────

/**
 * Full per-contract option chain for one underlying — a crypto venue, a listed
 * equity or a metal ETF, whichever provider covers the asset (pin with
 * `source`, since routing is first-match and several providers serve this).
 *
 * A chain is a big payload (thousands of contracts) and an exchange's keyless
 * feed is 15-minute delayed anyway, so polling faster than the delay only
 * re-downloads the same quotes: the default cadence matches it.
 */
export function useOptionsChain(
  symbol: string,
  source?: string,
  refreshMs = 5 * 60_000,
): { data: OptionsChain | null; isLoading: boolean } {
  const provider = useProviderFor("options-chain", source);
  const { data, isLoading } = usePolled<OptionsChain | null>(
    provider?.getOptionsChain && symbol
      ? () => provider.getOptionsChain!(symbol)
      : null,
    null,
    [provider, symbol, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
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

// ── DeFi & protocol economy ──────────────────────────────────────────────────

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

/**
 * One protocol's fee and revenue history — the crypto income statement, keyed
 * by the publisher's protocol slug ("uniswap"), not a token ticker.
 *
 * Daily data that only closes once a day, so this polls slowly (~30 min); the
 * frames that pair it with a live market cap re-derive the multiple from the
 * cap's own faster poll.
 */
export function useProtocolFundamentals(
  protocol: string,
  refreshMs = 30 * 60_000,
): { fundamentals: ProtocolFundamentals | null; isLoading: boolean } {
  const provider = useProviderFor("protocol-fundamentals");
  const { data: fundamentals, isLoading } =
    usePolled<ProtocolFundamentals | null>(
      provider?.getProtocolFundamentals && protocol
        ? () => provider.getProtocolFundamentals!(protocol)
        : null,
      null,
      [provider, protocol, refreshMs],
      refreshMs,
    );
  return { fundamentals, isLoading };
}

/**
 * One token's emission and unlock schedule, including scheduled future
 * unlocks. Keyed by the publisher's protocol slug, not a ticker.
 *
 * A vesting schedule changes when a protocol amends it — measured in months —
 * so this polls slowly (~6h). The payload is large; the provider's cache is
 * what makes several cards on one token cheap, not a fast poll.
 */
export function useTokenUnlocks(
  protocol: string,
  refreshMs = 6 * 60 * 60_000,
): { unlocks: TokenUnlocks | null; isLoading: boolean } {
  const provider = useProviderFor("token-unlocks");
  const { data: unlocks, isLoading } = usePolled<TokenUnlocks | null>(
    provider?.getTokenUnlocks && protocol
      ? () => provider.getTokenUnlocks!(protocol)
      : null,
    null,
    [provider, protocol, refreshMs],
    refreshMs,
  );
  return { unlocks, isLoading };
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

// ── On-chain networks (Bitcoin, Ethereum, cross-chain) ───────────────────────

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
  enabled = true,
): { history: SeriesPoint[]; isLoading: boolean } {
  const provider = useProviderFor("price-history-daily");
  const key = asset.toLowerCase();
  // `enabled` exists for frames that can read EITHER this deep crypto series or
  // a per-symbol candle feed: hooks can't be called conditionally, so the
  // unused branch has to be switched off here rather than skipped at the call
  // site — otherwise a stock card silently downloads years of BTC closes it
  // never renders.
  const { data: history, isLoading } = usePolled<SeriesPoint[]>(
    enabled && provider?.getDailyCloseHistory
      ? () => provider.getDailyCloseHistory!(key)
      : null,
    [],
    [provider, key, refreshMs, enabled],
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

// ── Macro, Treasury & rates ──────────────────────────────────────────────────

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

// ── Equity & SEC filings ─────────────────────────────────────────────────────

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
 * SEC EDGAR XBRL *reported history* — the full series behind the headline
 * metrics, oldest→newest. Same source and cadence as {@link useCompanyFacts}
 * (filings only), so it polls just as slowly.
 *
 * `cadence` picks which duration facts survive the filter: annual prints make
 * the readable multi-year trend, quarterly ones the seasonal detail. Balance-
 * sheet series are instant facts and ignore it.
 */
export function useCompanyFactsHistory(
  tickerOrCik: string,
  cadence: "annual" | "quarterly" = "annual",
  refreshMs = 12 * 60 * 60_000,
): { data: CompanyFactsHistory | null; isLoading: boolean } {
  const provider = useProviderFor("fundamentals-history");
  const { data, isLoading } = usePolled<CompanyFactsHistory | null>(
    provider?.getCompanyFactsHistory && tickerOrCik
      ? () => provider.getCompanyFactsHistory!(tickerOrCik, cadence)
      : null,
    null,
    [provider, tickerOrCik, cadence, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * Exchange profile + valuation snapshot for one listed company. Market cap and
 * the analyst target move with the price, so this polls on a quote-ish cadence
 * (5 min) rather than the filing cadence the statement hooks use.
 */
export function useEquityProfile(
  symbol: string,
  source?: string,
  refreshMs = 5 * 60_000,
): { data: EquityProfile | null; isLoading: boolean } {
  const provider = useProviderFor("equity-profile", source);
  const { data, isLoading } = usePolled<EquityProfile | null>(
    provider?.getEquityProfile && symbol
      ? () => provider.getEquityProfile!(symbol)
      : null,
    null,
    [provider, symbol, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * Published multi-period financial statements (income, balance sheet, cash
 * flow, ratios). Changes only when the company reports, so it polls every 12 h.
 */
export function useEquityFinancials(
  symbol: string,
  frequency: "annual" | "quarterly" = "annual",
  source?: string,
  refreshMs = 12 * 60 * 60_000,
): { data: EquityFinancials | null; isLoading: boolean } {
  const provider = useProviderFor("equity-financials", source);
  const { data, isLoading } = usePolled<EquityFinancials | null>(
    provider?.getEquityFinancials && symbol
      ? () => provider.getEquityFinancials!(symbol, frequency)
      : null,
    null,
    [provider, symbol, frequency, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * Reported-vs-consensus earnings track record plus the next scheduled date.
 * Quarterly data, but the next-date field can move intraday around a
 * confirmation, so this polls every 6 h rather than every 12.
 */
export function useEarningsHistory(
  symbol: string,
  source?: string,
  refreshMs = 6 * 60 * 60_000,
): { data: EarningsHistory | null; isLoading: boolean } {
  const provider = useProviderFor("earnings-history", source);
  const { data, isLoading } = usePolled<EarningsHistory | null>(
    provider?.getEarningsHistory && symbol
      ? () => provider.getEarningsHistory!(symbol)
      : null,
    null,
    [provider, symbol, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/**
 * Companies scheduled to report on `date` (ISO; omit for the next session).
 * Market-wide, not per-symbol — the one earnings hook that takes no ticker.
 */
export function useEarningsCalendar(
  date?: string,
  source?: string,
  refreshMs = 6 * 60 * 60_000,
): { data: EarningsCalendarEntry[]; isLoading: boolean } {
  const provider = useProviderFor("earnings-calendar", source);
  const { data, isLoading } = usePolled<EarningsCalendarEntry[]>(
    provider?.getEarningsCalendar
      ? () => provider.getEarningsCalendar!(date)
      : null,
    [],
    [provider, date, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/** Sell-side consensus and covering brokers. Ratings change rarely — 12 h. */
export function useAnalystRatings(
  symbol: string,
  source?: string,
  refreshMs = 12 * 60 * 60_000,
): { data: AnalystRatings | null; isLoading: boolean } {
  const provider = useProviderFor("analyst-ratings", source);
  const { data, isLoading } = usePolled<AnalystRatings | null>(
    provider?.getAnalystRatings && symbol
      ? () => provider.getAnalystRatings!(symbol)
      : null,
    null,
    [provider, symbol, refreshMs],
    refreshMs,
  );
  return { data, isLoading };
}

/** Institutional (13F) ownership aggregates. Quarterly data — polls every 12 h. */
export function useInstitutionalOwnership(
  symbol: string,
  source?: string,
  refreshMs = 12 * 60 * 60_000,
): { data: InstitutionalOwnership | null; isLoading: boolean } {
  const provider = useProviderFor("institutional-ownership", source);
  const { data, isLoading } = usePolled<InstitutionalOwnership | null>(
    provider?.getInstitutionalOwnership && symbol
      ? () => provider.getInstitutionalOwnership!(symbol)
      : null,
    null,
    [provider, symbol, refreshMs],
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

// ── Metals & commodities ─────────────────────────────────────────────────────

/**
 * Live metal spot quotes (gold, silver, platinum, palladium, copper), polled
 * every ~60s — the quote endpoint updates continuously but metals move far
 * slower than crypto, and this is one HTTP call per metal.
 */
export function useMetalSpot(
  symbols?: readonly string[],
  refreshMs = 60_000,
): { metals: MetalSpot[]; isLoading: boolean } {
  const provider = useProviderFor("metal-spot");
  // `key` is what the effect actually depends on; `symbols` is a fresh array
  // each render and would re-fire the poll every time.
  const key = symbols ? symbols.join(",") : "*";
  const wanted = key === "*" ? undefined : key.split(",").filter(Boolean);
  const { data: metals, isLoading } = usePolled<MetalSpot[]>(
    provider?.getMetalSpot ? () => provider.getMetalSpot!(wanted) : null,
    [],
    [provider, key, refreshMs],
    refreshMs,
  );
  return { metals, isLoading };
}

/**
 * Daily London-fix history per metal, oldest→newest, polled every ~6h — the
 * LBMA fixes twice a business day, and the provider serves one shared download
 * per metal to every frame on the board.
 */
export function useMetalHistory(
  symbols: readonly string[],
  currency = "USD",
  refreshMs = 6 * 60 * 60_000,
): { histories: MetalHistory[]; isLoading: boolean } {
  const provider = useProviderFor("metal-history");
  const key = [...symbols].join(",");
  const { data: histories, isLoading } = usePolled<MetalHistory[]>(
    provider?.getMetalHistory
      ? () =>
          provider.getMetalHistory!(key.split(",").filter(Boolean), currency)
      : null,
    [],
    [provider, key, currency, refreshMs],
    refreshMs,
  );
  return { histories, isLoading };
}

/**
 * Weekly CFTC Commitments-of-Traders positioning for one metal, polled every
 * ~6h — the report lands once a week (Friday, for the prior Tuesday).
 */
export function useMetalPositioning(
  symbol: string,
  refreshMs = 6 * 60 * 60_000,
): { positioning: MetalPositioning | null; isLoading: boolean } {
  const provider = useProviderFor("metal-positioning");
  const { data: positioning, isLoading } = usePolled<MetalPositioning | null>(
    provider?.getMetalPositioning
      ? () => provider.getMetalPositioning!(symbol)
      : null,
    null,
    [provider, symbol, refreshMs],
    refreshMs,
  );
  return { positioning, isLoading };
}

/** The U.S. Treasury's official gold reserve, polled every ~12h (monthly data). */
export function useGoldReserve(refreshMs = 12 * 60 * 60_000): {
  reserve: GoldReserve | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("gold-reserve");
  const { data: reserve, isLoading } = usePolled<GoldReserve | null>(
    provider?.getGoldReserve ? () => provider.getGoldReserve!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { reserve, isLoading };
}

/**
 * Daily history of a listed commodity implied-volatility index — GVZ (gold),
 * VXSLV (silver), VXGDX (gold miners), OVX (oil). One index per call, keyed by
 * the publisher's symbol, so a card picks its own.
 *
 * The publisher posts one close per session, so this polls slowly (~6h): a
 * faster cadence re-downloads a file whose last row cannot have moved.
 */
export function useCommodityVolIndex(
  indexId: string,
  refreshMs = 6 * 60 * 60_000,
): { series: OfficialSeries | null; isLoading: boolean } {
  const provider = useProviderFor("commodity-vol-index");
  const { data: series, isLoading } = usePolled<OfficialSeries | null>(
    provider?.getCommodityVolIndex && indexId
      ? () => provider.getCommodityVolIndex!(indexId)
      : null,
    null,
    [provider, indexId, refreshMs],
    refreshMs,
  );
  return { series, isLoading };
}

/**
 * A macro reference series to sit a commodity against: `CPIAUCSL` (CPI, for
 * deflating a nominal price history into a real one), `DFII10` (10-year TIPS
 * real yield), `DTWEXBGS` (broad dollar index), `T10YIE` (10-year breakeven).
 *
 * Note the near-namesake: {@link useMacroSeries} routes `macro-series`, which is
 * BLS's period-labelled CPI/unemployment shape, to a provider mounted EARLIER in
 * routing order. This is a separate capability precisely so a FRED id cannot
 * land there. Monthly and daily official series both revise slowly, so this
 * polls every ~6h.
 */
export function useMacroReferenceSeries(
  seriesId: string,
  refreshMs = 6 * 60 * 60_000,
): { series: OfficialSeries | null; isLoading: boolean } {
  const provider = useProviderFor("macro-reference-series");
  const { data: series, isLoading } = usePolled<OfficialSeries | null>(
    provider?.getMacroReferenceSeries && seriesId
      ? () => provider.getMacroReferenceSeries!(seriesId)
      : null,
    null,
    [provider, seriesId, refreshMs],
    refreshMs,
  );
  return { series, isLoading };
}

/** Gold-backed tokens and their premium to spot, polled every ~15 min. */
export function useTokenizedGold(refreshMs = 15 * 60_000): {
  tokens: TokenizedGold[];
  isLoading: boolean;
} {
  const provider = useProviderFor("tokenized-gold");
  const { data: tokens, isLoading } = usePolled<TokenizedGold[]>(
    provider?.getTokenizedGold ? () => provider.getTokenizedGold!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { tokens, isLoading };
}

// ── Housing, credit & index levels ───────────────────────────────────────────

/**
 * Level history for one market index (S&P 500, VIX, Nasdaq Composite), polled
 * every ~6h — the underlying series print once a day at best.
 */
export function useIndexSeries(
  seriesId: string,
  refreshMs = 6 * 60 * 60_000,
): { series: OfficialSeries | null; isLoading: boolean } {
  const provider = useProviderFor("index-level");
  const { data: series, isLoading } = usePolled<OfficialSeries | null>(
    provider?.getIndexSeries && seriesId
      ? () => provider.getIndexSeries!(seriesId)
      : null,
    null,
    [provider, seriesId, refreshMs],
    refreshMs,
  );
  return { series, isLoading };
}

/** Corporate credit spreads (high-yield + investment-grade OAS), polled every ~6h. */
export function useCreditSpreads(refreshMs = 6 * 60 * 60_000): {
  spreads: OfficialSeries[];
  isLoading: boolean;
} {
  const provider = useProviderFor("credit-spread");
  const { data: spreads, isLoading } = usePolled<OfficialSeries[]>(
    provider?.getCreditSpreads ? () => provider.getCreditSpreads!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  );
  return { spreads, isLoading };
}

/** National house-price index (Case-Shiller), polled every ~12h (monthly data). */
export function useHousingPriceIndex(refreshMs = 12 * 60 * 60_000): {
  series: OfficialSeries | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("housing-price");
  const { data: series, isLoading } = usePolled<OfficialSeries | null>(
    provider?.getHousingPriceIndex
      ? () => provider.getHousingPriceIndex!()
      : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { series, isLoading };
}

/** Benchmark 30-year fixed mortgage rate, polled every ~12h (weekly data). */
export function useMortgageRates(refreshMs = 12 * 60 * 60_000): {
  series: OfficialSeries | null;
  isLoading: boolean;
} {
  const provider = useProviderFor("mortgage-rate");
  const { data: series, isLoading } = usePolled<OfficialSeries | null>(
    provider?.getMortgageRates ? () => provider.getMortgageRates!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  );
  return { series, isLoading };
}

/**
 * Typical home value (Zillow ZHVI) per region, polled every ~12h — the file
 * publishes monthly. `regions` must be a stable reference (a module constant or
 * a `useMemo`), since it keys the polling effect.
 */
export function useHomeValueIndex(
  regions?: string[],
  refreshMs = 12 * 60 * 60_000,
): { index: HomeValueIndex | null; isLoading: boolean } {
  const provider = useProviderFor("home-value-index");
  // The array identity would change every render for an inline literal, so key
  // the effect on its contents instead — same trick the symbol-list hooks use.
  const key = regions?.join(",") ?? "";
  const { data: index, isLoading } = usePolled<HomeValueIndex | null>(
    provider?.getHomeValueIndex
      ? () => provider.getHomeValueIndex!(regions)
      : null,
    null,
    [provider, key, refreshMs],
    refreshMs,
  );
  return { index, isLoading };
}

/**
 * FHFA house-price index per state or metro, polled daily — the series is
 * quarterly, so anything faster is wasted work.
 */
export function useRegionalHousingPrice(
  regions: string[],
  level = "state",
  refreshMs = 24 * 60 * 60_000,
): { housing: RegionalHousingPrice | null; isLoading: boolean } {
  const provider = useProviderFor("regional-housing-price");
  const key = regions.join(",");
  const { data: housing, isLoading } = usePolled<RegionalHousingPrice | null>(
    provider?.getRegionalHousingPrice && regions.length > 0
      ? () => provider.getRegionalHousingPrice!(regions, level)
      : null,
    null,
    [provider, key, level, refreshMs],
    refreshMs,
  );
  return { housing, isLoading };
}

// ── FX & currency ────────────────────────────────────────────────────────────

/** FX rates for `symbols` quoted against `base`, each with a short trend.
 *  Polled hourly by default — ECB publishes reference rates once a business
 *  day, so there's nothing faster to see.
 *
 *  An EMPTY `symbols` list asks for nothing and gets no loader: no request, no
 *  poll timer, `[]` and not loading. `DashboardCurrencyProvider` runs this hook
 *  unconditionally (hooks can't be conditional) and passes `[]` on a USD board,
 *  which used to invoke the mounted provider once per board with nothing to
 *  price — harmless only because every fx provider happens to short-circuit an
 *  empty list before fetching. That is not a promise the provider contract
 *  makes, so the short-circuit belongs here. */
export function useFxRates(
  base: string,
  symbols: readonly string[],
  refreshMs = 60 * 60_000,
): { rates: FxRate[]; isLoading: boolean } {
  const provider = useProviderFor("fx-rates");
  const key = symbols.join(",");
  const { data: rates, isLoading } = usePolled<FxRate[]>(
    provider?.getFxRates && symbols.length > 0
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

// ── News & sentiment ─────────────────────────────────────────────────────────

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

// ── Portfolio (keyed tier) ───────────────────────────────────────────────────

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
