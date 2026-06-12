import type {
  Capability,
  GlobalMarket,
  MarketDataProvider,
} from "@zframes/core";

const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";

interface CoinGeckoGlobal {
  data: {
    total_market_cap: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

/**
 * Free-tier CoinGecko provider (no API key; generous limits for one
 * dashboard's polling cadence).
 * - global-market: total marketcap + per-asset dominance.
 */
export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = "coingecko";
  readonly capabilities: readonly Capability[] = ["global-market"];

  async getGlobalMarket(): Promise<GlobalMarket> {
    const res = await fetch(GLOBAL_URL);
    if (!res.ok) throw new Error(`coingecko global failed: ${res.status}`);
    const body = (await res.json()) as CoinGeckoGlobal;
    return {
      totalMarketCapUsd: body.data.total_market_cap.usd ?? 0,
      marketCapChangePct24h: body.data.market_cap_change_percentage_24h_usd,
      dominance: body.data.market_cap_percentage,
    };
  }
}
