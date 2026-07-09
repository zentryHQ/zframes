import type {
  Capability,
  MarketDataProvider,
  OnchainExtras,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE = "https://bitcoin-data.com/v1";
// Keep a bounded recent tail per metric for the sparkline — the full series runs
// to thousands of daily points we don't need on a card.
const TAIL = 365;

/**
 * bitcoin-data.com returns each metric as an array of daily rows shaped
 * `{ d: "YYYY-MM-DD", unixTs: <seconds>, <metricSlug>: <number|string> }`. The
 * metric field name differs per endpoint (sopr, puellMultiple, reserveRisk, …),
 * so we read it generically: the value is the first field that isn't `d`/`unixTs`
 * and parses as a finite number. That way a slug rename can't silently break us.
 */
function seriesFrom(payload: unknown): SeriesPoint[] {
  if (!Array.isArray(payload)) return [];
  const out: SeriesPoint[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const secs = Number(rec.unixTs);
    const time = Number.isFinite(secs)
      ? secs * 1000
      : Date.parse(String(rec.d));
    let value = NaN;
    for (const [key, raw] of Object.entries(rec)) {
      if (key === "d" || key === "unixTs") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) {
        value = n;
        break;
      }
    }
    if (Number.isFinite(time) && Number.isFinite(value))
      out.push({ time, value });
  }
  return out.sort((a, b) => a.time - b.time);
}

const latestValue = (s: SeriesPoint[]): number | null =>
  s.length ? s[s.length - 1].value : null;

/**
 * Keyless on-chain cycle-oscillator provider backed by bitcoin-data.com
 * (CORS-open, no proxy). Its free tier is hard-capped at **10 requests/hour**,
 * so every metric loads behind ONE shared, long-TTL poll: `getOnchainExtras`
 * fetches all three series in a single refresh (3 requests) and the cache holds
 * the result for 18h, dedups concurrent frames, and serves the last good value
 * on a transient 429. A frame should NOT poll this faster than its 12h+ hook.
 */
export class BitcoinDataProvider implements MarketDataProvider {
  readonly name = "bitcoin-data.com";
  readonly capabilities: readonly Capability[] = ["onchain-cycle-extras"];

  private readonly cache = new TtlCache<OnchainExtras>({
    namespace: "zframes:bitcoin-data:extras",
    ttlMs: 18 * 60 * 60_000,
    persist: true,
  });

  async getOnchainExtras(): Promise<OnchainExtras> {
    return this.cache.get("latest", async () => {
      const [soprR, puellR, rrR] = await Promise.allSettled([
        fetchJson<unknown>(`${BASE}/sopr`),
        fetchJson<unknown>(`${BASE}/puell-multiple`),
        fetchJson<unknown>(`${BASE}/reserve-risk`),
      ]);
      const sopr =
        soprR.status === "fulfilled"
          ? seriesFrom(soprR.value).slice(-TAIL)
          : [];
      const puell =
        puellR.status === "fulfilled"
          ? seriesFrom(puellR.value).slice(-TAIL)
          : [];
      const reserveRisk =
        rrR.status === "fulfilled" ? seriesFrom(rrR.value).slice(-TAIL) : [];
      // All three failing means the whole refresh was rate-limited/unreachable —
      // throw so the cache keeps the last good value instead of caching empties.
      if (sopr.length === 0 && puell.length === 0 && reserveRisk.length === 0)
        throw new Error(
          "bitcoin-data: all metric fetches failed (likely rate-limited)",
        );
      const lastTime = Math.max(
        sopr.at(-1)?.time ?? 0,
        puell.at(-1)?.time ?? 0,
        reserveRisk.at(-1)?.time ?? 0,
      );
      return {
        date: new Date(lastTime).toISOString().slice(0, 10),
        sopr: latestValue(sopr),
        puell: latestValue(puell),
        reserveRisk: latestValue(reserveRisk),
        history: { sopr, puell, reserveRisk },
      };
    });
  }
}
