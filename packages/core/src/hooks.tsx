import {
  createContext,
  useContext,
  useEffect,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import type {
  Candle,
  Capability,
  DayStats,
  FearGreedPoint,
  FundingPoint,
  GlobalMarket,
  MarketDataProvider,
  TvlEntry,
} from './types'

const ProvidersContext = createContext<MarketDataProvider[]>([])

export function FramesProvider({
  providers,
  children,
}: {
  providers: MarketDataProvider | MarketDataProvider[]
  children: ReactNode
}) {
  const list = Array.isArray(providers) ? providers : [providers]
  return <ProvidersContext.Provider value={list}>{children}</ProvidersContext.Provider>
}

export function useProviders(): MarketDataProvider[] {
  return useContext(ProvidersContext)
}

/** First registered provider advertising the capability, or null. */
export function useProviderFor(capability: Capability): MarketDataProvider | null {
  const providers = useProviders()
  return providers.find((p) => p.capabilities.includes(capability)) ?? null
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
  const [data, setData] = useState<T>(fallback)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    if (!load) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const run = () => {
      load()
        .then((next) => {
          if (cancelled) return
          setData(next)
          setIsLoading(false)
        })
        .catch(() => {
          // keep last good value; the next poll retries
          if (!cancelled) setIsLoading(false)
        })
    }
    run()
    const id = setInterval(run, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, isLoading }
}

/** Live mid prices for the given symbols, streamed from a quote-stream provider. */
export function useMids(symbols: readonly string[]): Record<string, number> {
  const provider = useProviderFor('quote-stream')
  const [mids, setMids] = useState<Record<string, number>>({})
  const key = symbols.join(',')
  useEffect(() => {
    const wanted = key.split(',').filter(Boolean)
    if (!provider?.subscribeMids || wanted.length === 0) return
    return provider.subscribeMids((all) => {
      setMids((prev) => {
        let changed = false
        const next = { ...prev }
        for (const symbol of wanted) {
          const value = all[symbol]
          if (value !== undefined && value !== next[symbol]) {
            next[symbol] = value
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, wanted)
  }, [provider, key])
  return mids
}

/**
 * 24h stats per symbol, polled on an interval. Pass no symbols (undefined)
 * for the provider's full universe — used by market-overview style frames.
 */
export function useDayStats(
  symbols?: readonly string[],
  refreshMs = 30_000,
): Record<string, DayStats> {
  const provider = useProviderFor('day-stats')
  const key = symbols ? symbols.join(',') : '*'
  const wanted = key === '*' ? undefined : key.split(',').filter(Boolean)
  const { data } = usePolled<Record<string, DayStats>>(
    provider?.getDayStats ? () => provider.getDayStats!(wanted) : null,
    {},
    [provider, key, refreshMs],
    refreshMs,
  )
  return data
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
  const provider = useProviderFor('funding-history')
  const key = symbols.join(',')
  const wanted = key.split(',').filter(Boolean)
  const { data: history, isLoading } = usePolled<Record<string, FundingPoint[]>>(
    provider?.getFundingHistory && wanted.length > 0
      ? () => provider.getFundingHistory!(wanted, startTimeMs)
      : null,
    {},
    [provider, key, startTimeMs, refreshMs],
    refreshMs,
  )
  return { history, isLoading }
}

/** OHLCV candles for one symbol, re-fetched on an interval. */
export function useCandles(
  symbol: string,
  interval: string,
  startTimeMs: number,
  refreshMs = 60_000,
): { candles: Candle[]; isLoading: boolean } {
  const provider = useProviderFor('ohlcv')
  const { data: candles, isLoading } = usePolled<Candle[]>(
    provider?.getCandles && symbol
      ? () => provider.getCandles!(symbol, interval, startTimeMs)
      : null,
    [],
    [provider, symbol, interval, startTimeMs, refreshMs],
    refreshMs,
  )
  return { candles, isLoading }
}

/** TVL per chain, polled slowly (TVL moves slowly). */
export function useTvlByChain(refreshMs = 10 * 60_000): {
  entries: TvlEntry[]
  isLoading: boolean
} {
  const provider = useProviderFor('tvl')
  const { data: entries, isLoading } = usePolled<TvlEntry[]>(
    provider?.getTvlByChain ? () => provider.getTvlByChain!() : null,
    [],
    [provider, refreshMs],
    refreshMs,
  )
  return { entries, isLoading }
}

/** Global market snapshot (total mcap, dominance), polled every few minutes. */
export function useGlobalMarket(refreshMs = 5 * 60_000): {
  market: GlobalMarket | null
  isLoading: boolean
} {
  const provider = useProviderFor('global-market')
  const { data: market, isLoading } = usePolled<GlobalMarket | null>(
    provider?.getGlobalMarket ? () => provider.getGlobalMarket!() : null,
    null,
    [provider, refreshMs],
    refreshMs,
  )
  return { market, isLoading }
}

/** Fear & greed index history (most recent first), polled hourly. */
export function useFearGreed(
  limit = 30,
  refreshMs = 60 * 60_000,
): { points: FearGreedPoint[]; isLoading: boolean } {
  const provider = useProviderFor('sentiment')
  const { data: points, isLoading } = usePolled<FearGreedPoint[]>(
    provider?.getFearGreed ? () => provider.getFearGreed!(limit) : null,
    [],
    [provider, limit, refreshMs],
    refreshMs,
  )
  return { points, isLoading }
}
