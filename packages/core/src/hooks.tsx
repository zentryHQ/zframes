import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
  const [stats, setStats] = useState<Record<string, DayStats>>({})
  const key = symbols ? symbols.join(',') : '*'
  useEffect(() => {
    const wanted = key === '*' ? undefined : key.split(',').filter(Boolean)
    if (!provider?.getDayStats) return
    let cancelled = false
    const load = () => {
      provider
        .getDayStats!(wanted)
        .then((next) => {
          if (!cancelled) setStats(next)
        })
        .catch(() => {
          // keep last good stats; next poll retries
        })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [provider, key, refreshMs])
  return stats
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
  const [history, setHistory] = useState<Record<string, FundingPoint[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const key = symbols.join(',')
  useEffect(() => {
    const wanted = key.split(',').filter(Boolean)
    if (!provider?.getFundingHistory || wanted.length === 0) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const load = () => {
      provider
        .getFundingHistory!(wanted, startTimeMs)
        .then((next) => {
          if (cancelled) return
          setHistory(next)
          setIsLoading(false)
        })
        .catch(() => {
          if (!cancelled) setIsLoading(false)
        })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [provider, key, startTimeMs, refreshMs])
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
  const [candles, setCandles] = useState<Candle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    if (!provider?.getCandles || !symbol) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const load = () => {
      provider
        .getCandles!(symbol, interval, startTimeMs)
        .then((next) => {
          if (cancelled) return
          setCandles(next)
          setIsLoading(false)
        })
        .catch(() => {
          if (!cancelled) setIsLoading(false)
        })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [provider, symbol, interval, startTimeMs, refreshMs])
  return { candles, isLoading }
}

/** TVL per chain, polled slowly (TVL moves slowly). */
export function useTvlByChain(refreshMs = 10 * 60_000): {
  entries: TvlEntry[]
  isLoading: boolean
} {
  const provider = useProviderFor('tvl')
  const [entries, setEntries] = useState<TvlEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    if (!provider?.getTvlByChain) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const load = () => {
      provider
        .getTvlByChain!()
        .then((next) => {
          if (cancelled) return
          setEntries(next)
          setIsLoading(false)
        })
        .catch(() => {
          if (!cancelled) setIsLoading(false)
        })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [provider, refreshMs])
  return { entries, isLoading }
}

/** Global market snapshot (total mcap, dominance), polled every few minutes. */
export function useGlobalMarket(refreshMs = 5 * 60_000): {
  market: GlobalMarket | null
  isLoading: boolean
} {
  const provider = useProviderFor('global-market')
  const [market, setMarket] = useState<GlobalMarket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    if (!provider?.getGlobalMarket) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const load = () => {
      provider
        .getGlobalMarket!()
        .then((next) => {
          if (cancelled) return
          setMarket(next)
          setIsLoading(false)
        })
        .catch(() => {
          if (!cancelled) setIsLoading(false)
        })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [provider, refreshMs])
  return { market, isLoading }
}

/** Fear & greed index history (most recent first), polled hourly. */
export function useFearGreed(
  limit = 30,
  refreshMs = 60 * 60_000,
): { points: FearGreedPoint[]; isLoading: boolean } {
  const provider = useProviderFor('sentiment')
  const [points, setPoints] = useState<FearGreedPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    if (!provider?.getFearGreed) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const load = () => {
      provider
        .getFearGreed!(limit)
        .then((next) => {
          if (cancelled) return
          setPoints(next)
          setIsLoading(false)
        })
        .catch(() => {
          if (!cancelled) setIsLoading(false)
        })
    }
    load()
    const id = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [provider, limit, refreshMs])
  return { points, isLoading }
}
