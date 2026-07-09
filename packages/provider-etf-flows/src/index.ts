import type {
  Capability,
  EtfFlows,
  EtfIssuerFlow,
  MarketDataProvider,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE = "https://api.sosovalue.xyz/openapi/v2/etf";
const TYPE: Record<string, string> = {
  btc: "us-btc-spot",
  eth: "us-eth-spot",
};

/** SoSoValue nests every number under {value, ...}; read + parse `.value`. */
interface Valued {
  value?: string | number;
}
interface HistoryRow {
  date?: string;
  totalNetInflow?: string | number;
}
interface HistoryResp {
  code?: number;
  data?: HistoryRow[];
}
interface IssuerRow {
  ticker?: string;
  institute?: string;
  dailyNetInflow?: Valued;
  netAssets?: Valued;
  cumNetInflow?: Valued;
}
interface MetricsResp {
  code?: number;
  data?: {
    dailyNetInflow?: Valued;
    cumNetInflow?: Valued;
    totalNetAssets?: Valued;
    list?: IssuerRow[];
  };
}

const val = (v: Valued | undefined): number => {
  const n = Number(v?.value);
  return Number.isFinite(n) ? n : 0;
};

async function post<T>(path: string, type: string): Promise<T> {
  return fetchJson<T>(`${BASE}/${path}`, undefined, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    },
  });
}

/**
 * Keyless spot-ETF-flows provider backed by SoSoValue's public gateway
 * (api.sosovalue.xyz; CORS-open, no proxy). Two POSTs per asset — a daily-total
 * history series + a per-issuer snapshot. BEST-EFFORT: this is SoSoValue's
 * undocumented internal gateway (the documented .com API is key-gated), so it may
 * change without notice — a failed fetch throws and the cache serves last-good /
 * the frame shows its empty state. Daily data → cache aggressively (6h).
 */
export class EtfFlowsProvider implements MarketDataProvider {
  readonly name = "SoSoValue";
  readonly capabilities: readonly Capability[] = ["etf-flows"];

  private readonly cache = new TtlCache<EtfFlows>({
    namespace: "zframes:etf-flows",
    ttlMs: 6 * 60 * 60_000,
    persist: true,
  });

  async getEtfFlows(asset: string): Promise<EtfFlows> {
    const key = (asset || "btc").toLowerCase();
    const type = TYPE[key] ?? TYPE.btc;
    return this.cache.get(key, async () => {
      const [hist, metrics] = await Promise.all([
        post<HistoryResp>("historicalInflowChart", type),
        post<MetricsResp>("currentEtfDataMetrics", type),
      ]);
      const rows = Array.isArray(hist?.data) ? hist.data : [];
      const history: SeriesPoint[] = rows
        .map((r) => ({
          time: Date.parse(String(r.date)),
          value: Number(r.totalNetInflow),
        }))
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time); // API returns newest-first
      const d = metrics?.data;
      const issuers: EtfIssuerFlow[] = (Array.isArray(d?.list) ? d.list : [])
        .map((r) => ({
          ticker: r.ticker ?? "",
          institute: r.institute ?? "",
          dailyNetInflow: val(r.dailyNetInflow),
          netAssets: val(r.netAssets),
          cumNetInflow: val(r.cumNetInflow),
        }))
        .filter((r) => r.ticker)
        .sort((a, b) => b.netAssets - a.netAssets);
      if (history.length === 0 && issuers.length === 0)
        throw new Error("etf-flows: empty response");
      const latest = history.at(-1);
      return {
        asset: key,
        date: latest ? new Date(latest.time).toISOString().slice(0, 10) : "",
        dailyTotalNetInflow: d?.dailyNetInflow
          ? val(d.dailyNetInflow)
          : (latest?.value ?? 0),
        cumNetInflow: val(d?.cumNetInflow),
        totalNetAssets: val(d?.totalNetAssets),
        issuers,
        history,
      };
    });
  }
}
