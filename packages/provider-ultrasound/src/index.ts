import type {
  Capability,
  EthSupply,
  MarketDataProvider,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE = "https://ultrasound.money/api/v2/fees";

interface GaugeRates {
  d1?: {
    burn_rate_yearly?: { eth?: number };
    issuance_rate_yearly?: { eth?: number };
    supply_growth_rate_yearly?: number;
    supply_growth_rate_yearly_pow?: number;
  };
}
interface ValidatorRewards {
  issuance?: { apr?: number };
  mev?: { apr?: number };
  tips?: { apr?: number };
}
interface BurnRates {
  d1?: { rate?: { eth_per_minute?: number } };
}
interface SupplyPoint {
  supply: number;
  timestamp: string;
}
interface SupplyOverTime {
  d30?: SupplyPoint[];
  d7?: SupplyPoint[];
  d1?: SupplyPoint[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Keyless Ethereum supply-economics provider backed by ultrasound.money's public
 * v2 API (CORS-open, no proxy) — the ETH counterpart to provider-mempool. One
 * `getEthSupply` call fans four endpoints (burn/issuance gauges, validator APR,
 * per-minute burn, supply history) behind a single cache. The host is
 * Cloudflare-fronted (max-age ~6s) and un-keyed, so we poll gently (~2 min TTL).
 */
export class UltrasoundProvider implements MarketDataProvider {
  readonly name = "ultrasound.money";
  readonly capabilities: readonly Capability[] = ["eth-supply"];

  private readonly cache = new TtlCache<EthSupply>({
    namespace: "zframes:ultrasound:eth-supply",
    ttlMs: 2 * 60_000,
    persist: true,
  });

  async getEthSupply(): Promise<EthSupply> {
    return this.cache.get("latest", async () => {
      const [gaugeR, rewardsR, burnR, supplyR] = await Promise.allSettled([
        fetchJson<GaugeRates>(`${BASE}/gauge-rates`),
        fetchJson<ValidatorRewards>(`${BASE}/validator-rewards`),
        fetchJson<BurnRates>(`${BASE}/burn-rates`),
        fetchJson<SupplyOverTime>(`${BASE}/supply-over-time`),
      ]);
      // gauge-rates carries the headline burn/issuance/net-growth picture — if it
      // fails the reading is meaningless, so throw (cache serves last good).
      if (gaugeR.status !== "fulfilled" || !gaugeR.value?.d1)
        throw new Error("ultrasound gauge-rates: unavailable");
      const g = gaugeR.value.d1;
      const rewards =
        rewardsR.status === "fulfilled" ? rewardsR.value : undefined;
      const stakingAprPct =
        (num(rewards?.issuance?.apr) +
          num(rewards?.mev?.apr) +
          num(rewards?.tips?.apr)) *
        100;
      const burnEthPerMin =
        burnR.status === "fulfilled"
          ? num(burnR.value?.d1?.rate?.eth_per_minute)
          : 0;
      const supplyPts =
        supplyR.status === "fulfilled"
          ? (supplyR.value?.d30 ?? supplyR.value?.d7 ?? supplyR.value?.d1 ?? [])
          : [];
      const history: SeriesPoint[] = supplyPts
        .map((p) => ({
          time: Date.parse(p.timestamp),
          value: Number(p.supply),
        }))
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
      const supply = history.length ? history[history.length - 1].value : 0;
      return {
        supply,
        burnRateYearlyEth: num(g.burn_rate_yearly?.eth),
        issuanceRateYearlyEth: num(g.issuance_rate_yearly?.eth),
        supplyGrowthYearlyPct: num(g.supply_growth_rate_yearly) * 100,
        supplyGrowthYearlyPowPct: num(g.supply_growth_rate_yearly_pow) * 100,
        stakingAprPct,
        burnEthPerMin,
        history,
      };
    });
  }
}
