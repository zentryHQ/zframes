import type {
  Capability,
  MarketDataProvider,
  OnchainValuation,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
// Community tier grants price, market cap, supply, and MVRV — but NOT realized
// cap (CapRealUSD is premium). We derive realized cap = marketCap / MVRV and
// realized price = realizedCap / supply, which need only these four.
const METRICS = "PriceUSD,CapMrktCurUSD,SplyCur,CapMVRVCur";

interface CmRow {
  asset: string;
  time: string;
  PriceUSD?: string;
  CapMrktCurUSD?: string;
  SplyCur?: string;
  CapMVRVCur?: string;
}
interface CmResponse {
  data?: CmRow[];
  next_page_url?: string | null;
}

/** One parsed daily observation. */
interface Parsed {
  /** Epoch milliseconds. */
  time: number;
  price: number;
  marketCap: number;
  supply: number;
  mvrv: number;
}

function parse(rows: CmRow[]): Parsed[] {
  const out: Parsed[] = [];
  for (const r of rows) {
    const price = Number(r.PriceUSD);
    const marketCap = Number(r.CapMrktCurUSD);
    const supply = Number(r.SplyCur);
    const mvrv = Number(r.CapMVRVCur);
    const time = Date.parse(r.time);
    if (
      !Number.isFinite(price) ||
      !Number.isFinite(marketCap) ||
      !Number.isFinite(supply) ||
      !Number.isFinite(mvrv) ||
      !Number.isFinite(time) ||
      mvrv <= 0 ||
      supply <= 0
    )
      continue;
    out.push({ time, price, marketCap, supply, mvrv });
  }
  // Coin Metrics returns ascending time, but sort defensively.
  return out.sort((a, b) => a.time - b.time);
}

/** Population standard deviation. */
function populationStd(xs: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/**
 * Keyless on-chain provider backed by the Coin Metrics community API
 * (community-api.coinmetrics.io), which is CORS-open — no proxy. One full-history
 * daily request (page_size 10000, ~5.8k rows for BTC, no pagination in practice)
 * yields everything two capabilities need:
 *  - onchain-valuation: MVRV, its Z-score, NUPL (derived 1−1/MVRV), realized
 *    price/cap (derived from MVRV + supply), and the daily series for charts.
 *  - price-history-daily: the long daily close series that drives the
 *    compute-in-frame cycle multiples (Mayer, Pi Cycle, 2Y/4Y-MA, RSI).
 *
 * Both methods share one cache keyed by asset, so a valuation frame and a
 * cycle-multiple frame on the same board dedup to a single fetch. TTL sits at 3h
 * (metrics update once daily); not persisted — the full-history payload is large
 * and a fresh pull on reload at this cadence is cheap enough.
 */
export class CoinMetricsProvider implements MarketDataProvider {
  readonly name = "Coin Metrics";
  readonly capabilities: readonly Capability[] = [
    "onchain-valuation",
    "price-history-daily",
  ];

  private readonly cache = new TtlCache<Parsed[]>({
    namespace: "zframes:coinmetrics:metrics",
    ttlMs: 3 * 60 * 60_000,
    persist: false,
  });

  private load(asset: string): Promise<Parsed[]> {
    return this.cache.get(asset, async () => {
      // page_size 10000 covers BTC's full daily history (~5.8k rows since 2010)
      // in a single response — the community endpoint returns no next page here,
      // so we don't paginate.
      const url = `${BASE}?assets=${asset}&metrics=${METRICS}&frequency=1d&page_size=10000&start_time=2010-01-01`;
      const body = await fetchJson<CmResponse>(url);
      const parsed = parse(body.data ?? []);
      if (parsed.length === 0)
        throw new Error("coinmetrics: no usable rows in response");
      return parsed;
    });
  }

  async getOnchainValuation(): Promise<OnchainValuation> {
    const rows = await this.load("btc");
    // Static full-history σ of market cap — the standard MVRV Z-score basis.
    const std = populationStd(rows.map((r) => r.marketCap));
    const price: SeriesPoint[] = [];
    const mvrv: SeriesPoint[] = [];
    const mvrvZScore: SeriesPoint[] = [];
    const nupl: SeriesPoint[] = [];
    const realizedPrice: SeriesPoint[] = [];
    for (const r of rows) {
      const realizedCap = r.marketCap / r.mvrv;
      price.push({ time: r.time, value: r.price });
      mvrv.push({ time: r.time, value: r.mvrv });
      mvrvZScore.push({
        time: r.time,
        value: std > 0 ? (r.marketCap - realizedCap) / std : 0,
      });
      nupl.push({ time: r.time, value: 1 - 1 / r.mvrv });
      realizedPrice.push({ time: r.time, value: realizedCap / r.supply });
    }
    const last = rows[rows.length - 1];
    const lastRealizedCap = last.marketCap / last.mvrv;
    return {
      date: new Date(last.time).toISOString().slice(0, 10),
      price: last.price,
      supply: last.supply,
      marketCap: last.marketCap,
      realizedCap: lastRealizedCap,
      realizedPrice: lastRealizedCap / last.supply,
      mvrv: last.mvrv,
      mvrvZScore: std > 0 ? (last.marketCap - lastRealizedCap) / std : 0,
      nupl: 1 - 1 / last.mvrv,
      history: { price, mvrv, mvrvZScore, nupl, realizedPrice },
    };
  }

  async getDailyCloseHistory(asset = "btc"): Promise<SeriesPoint[]> {
    const rows = await this.load(asset.toLowerCase());
    return rows.map((r) => ({ time: r.time, value: r.price }));
  }
}
