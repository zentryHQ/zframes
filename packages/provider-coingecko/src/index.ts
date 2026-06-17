import type {
  Capability,
  GlobalMarket,
  MarketDataProvider,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

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
    const body = await fetchJson<CoinGeckoGlobal>(GLOBAL_URL);
    // The free tier can answer a throttle/error with an unexpected body; guard
    // the shape so it throws a clear error instead of a deep `undefined` access.
    if (!body?.data?.total_market_cap || !body.data.market_cap_percentage)
      throw new Error("coingecko global: unexpected response shape");
    const change = Number(body.data.market_cap_change_percentage_24h_usd);
    return {
      totalMarketCapUsd: body.data.total_market_cap.usd ?? 0,
      marketCapChangePct24h: Number.isFinite(change) ? change : 0,
      dominance: body.data.market_cap_percentage,
    };
  }
}
