import type {
  Capability,
  FearGreedPoint,
  MarketDataProvider,
} from "@zframes/core";

const FNG_URL = "https://api.alternative.me/fng/";

interface FngResponse {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
}

/**
 * Free, no-API-key provider backed by alternative.me's public API.
 * - sentiment: crypto fear & greed index (0 extreme fear … 100 extreme greed).
 */
export class AlternativeMeProvider implements MarketDataProvider {
  readonly name = "alternative.me";
  readonly capabilities: readonly Capability[] = ["sentiment"];

  async getFearGreed(limit = 30): Promise<FearGreedPoint[]> {
    const res = await fetch(`${FNG_URL}?limit=${limit}`);
    if (!res.ok) throw new Error(`alternative.me fng failed: ${res.status}`);
    const body = (await res.json()) as FngResponse;
    return body.data.map((entry) => ({
      value: Number(entry.value),
      classification: entry.value_classification,
      time: Number(entry.timestamp) * 1000,
    }));
  }
}
