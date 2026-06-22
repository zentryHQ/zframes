import type {
  Capability,
  FearGreedPoint,
  MarketDataProvider,
} from "@zframes/core";
import { TtlCache } from "@zframes/core/cache";
import { fetchJson } from "@zframes/core/fetch";

const FNG_URL = "https://api.alternative.me/fng/";

// The fear & greed index updates once a day, so the shared cache reuses it for
// 45 min (under useFearGreed's hourly poll), dedups concurrent loads, persists
// across reloads, and serves the last good series on a transient error. Keyed by
// `limit`, since a frame may request a different history length.
const sentimentCache = new TtlCache<FearGreedPoint[]>({
  namespace: "zframes:alternativeme:fng",
  ttlMs: 45 * 60_000,
  persist: true,
  revive: (value) =>
    Array.isArray(value) ? (value as FearGreedPoint[]) : null,
});

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
    return sentimentCache.get(String(limit), async () => {
      const body = await fetchJson<FngResponse>(`${FNG_URL}?limit=${limit}`);
      if (!Array.isArray(body?.data))
        throw new Error("alternative.me fng: unexpected response shape");
      // alternative.me returns numbers as strings; drop any row that doesn't
      // parse so a malformed entry never renders as a literal "NaN".
      return body.data
        .map((entry) => ({
          value: Number(entry.value),
          classification: entry.value_classification ?? "",
          time: Number(entry.timestamp) * 1000,
        }))
        .filter(
          (point) =>
            Number.isFinite(point.value) && Number.isFinite(point.time),
        );
    });
  }
}
