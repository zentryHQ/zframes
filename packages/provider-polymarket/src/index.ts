import type {
  Capability,
  MarketDataProvider,
  PredictionMarket,
  PredictionOutcome,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const MARKETS_URL = "https://gamma-api.polymarket.com/markets";

interface GammaMarket {
  question?: string;
  /** JSON-stringified array, e.g. '["Yes","No"]'. */
  outcomes?: string;
  /** JSON-stringified array parallel to outcomes, e.g. '["0.47","0.53"]'. */
  outcomePrices?: string;
  volume24hr?: number;
  endDate?: string;
}

/** Parse one of Gamma's JSON-stringified array fields into a string[]. */
function parseStringArray(raw: string | undefined): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Keyless Polymarket provider backed by the public Gamma API (CORS-open, no
 * proxy). Returns the highest-volume open markets with their outcome
 * probabilities. Gamma encodes `outcomes` and `outcomePrices` as JSON-stringified
 * arrays that must be parsed and paired positionally (a price is the 0–1
 * market-implied probability). Cloudflare-cached ~5 min → 4-min TTL.
 */
export class PolymarketProvider implements MarketDataProvider {
  readonly name = "Polymarket";
  readonly capabilities: readonly Capability[] = ["prediction-markets"];

  private readonly cache = new TtlCache<PredictionMarket[]>({
    namespace: "zframes:polymarket:markets",
    ttlMs: 4 * 60_000,
    persist: true,
  });

  async getPredictionMarkets(limit = 12): Promise<PredictionMarket[]> {
    const capped = Math.min(Math.max(limit, 1), 50);
    return this.cache.get(String(capped), async () => {
      const url = `${MARKETS_URL}?closed=false&limit=${capped}&order=volume&ascending=false`;
      const body = await fetchJson<GammaMarket[]>(url);
      if (!Array.isArray(body))
        throw new Error("polymarket markets: unexpected response shape");
      return body
        .map((m): PredictionMarket | null => {
          const labels = parseStringArray(m.outcomes);
          const prices = parseStringArray(m.outcomePrices);
          if (!m.question || labels.length === 0) return null;
          const outcomes: PredictionOutcome[] = labels
            .map((label, i) => ({ label, prob: Number(prices[i]) }))
            .filter((o) => Number.isFinite(o.prob));
          if (outcomes.length === 0) return null;
          return {
            question: m.question,
            outcomes,
            volume24h: Number.isFinite(m.volume24hr)
              ? (m.volume24hr as number)
              : 0,
            endDate: m.endDate ?? "",
          };
        })
        .filter((m): m is PredictionMarket => m !== null);
    });
  }
}
