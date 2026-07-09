import type {
  Capability,
  DollarIndex,
  FxRate,
  MarketDataProvider,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE_URL = "https://api.frankfurter.dev/v1";

// ICE US Dollar Index: a fixed-weight geometric mean of six USD pairs. With
// Frankfurter quoting everything as "currency per USD" (base=USD), each pair's
// signed exponent collapses to a positive power of that per-USD rate:
//   DXY = 50.14348112 · EUR^0.576 · JPY^0.136 · GBP^0.119 · CAD^0.091
//                     · SEK^0.042 · CHF^0.036
// (EURUSD^-0.576 = (1/EURperUSD)^-0.576 = EURperUSD^0.576, and likewise GBP.)
const DXY_CONSTANT = 50.14348112;
const DXY_WEIGHTS: Record<string, number> = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
};

// Frankfurter is CORS-open and keyless, but it serves ECB reference data: rates
// publish once per business day (~16:00 CET). One short timeseries request
// returns the whole window we need — latest rate, previous-day change, and a
// sparkline — so the shared cache keeps a TTL just under the hook's hourly poll,
// dedups concurrent loads across frames, persists across reloads, and serves the
// last good value on a transient error. Keyed by base+symbols so different
// boards don't collide.
const cache = new TtlCache<FxRate[]>({
  namespace: "zframes:fx",
  ttlMs: 55 * 60_000,
  persist: true,
});

// Synthetic DXY shares Frankfurter's once-a-business-day cadence, so it gets its
// own single-slot cache at the same TTL.
const dxyCache = new TtlCache<DollarIndex>({
  namespace: "zframes:fx:dxy",
  ttlMs: 55 * 60_000,
  persist: true,
});

// ECB skips weekends/holidays, so ~40 calendar days comfortably yields 20+
// business-day points for the change% + sparkline.
const WINDOW_DAYS = 40;

interface FrankfurterTimeseries {
  base: string;
  start_date: string;
  end_date: string;
  /** date (YYYY-MM-DD) → { CURRENCY → rate }. */
  rates: Record<string, Record<string, number>>;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Keyless FX provider backed by Frankfurter (api.frankfurter.dev), which serves
 * the ECB's daily euro reference rates rebased to any currency. CORS-open, so
 * no proxy. One open-ended timeseries request per (base, symbols) yields each
 * currency's latest rate, its change vs the previous business day, and a daily
 * trend for a sparkline.
 */
export class FxProvider implements MarketDataProvider {
  readonly name = "fx";
  readonly capabilities: readonly Capability[] = ["fx-rates", "dollar-index"];

  async getFxRates(base: string, symbols: string[]): Promise<FxRate[]> {
    const b = base.toUpperCase();
    // A currency can't be quoted against itself, and Frankfurter rejects it.
    const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(
      (s) => s && s !== b,
    );
    if (wanted.length === 0) return [];
    const key = `${b}:${[...wanted].sort().join(",")}`;
    return cache.get(key, async () => {
      const url = `${BASE_URL}/${isoDaysAgo(WINDOW_DAYS)}..?base=${b}&symbols=${wanted.join(",")}`;
      const body = await fetchJson<FrankfurterTimeseries>(url);
      if (!body?.rates)
        throw new Error("frankfurter: unexpected response shape");
      const days = Object.keys(body.rates).sort(); // ascending YYYY-MM-DD
      // Preserve the caller's requested order.
      return wanted
        .map((symbol): FxRate | null => {
          const history: SeriesPoint[] = [];
          for (const day of days) {
            const value = body.rates[day]?.[symbol];
            if (typeof value === "number" && Number.isFinite(value))
              history.push({
                time: new Date(`${day}T00:00:00Z`).getTime(),
                value,
              });
          }
          if (history.length === 0) return null;
          const latest = history[history.length - 1].value;
          const prev =
            history.length > 1 ? history[history.length - 2].value : latest;
          const changePct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
          return { symbol, base: b, rate: latest, changePct, history };
        })
        .filter((rate): rate is FxRate => rate !== null);
    });
  }

  async getDollarIndex(): Promise<DollarIndex> {
    return dxyCache.get("dxy", async () => {
      const symbols = Object.keys(DXY_WEIGHTS);
      const url = `${BASE_URL}/${isoDaysAgo(WINDOW_DAYS)}..?base=USD&symbols=${symbols.join(",")}`;
      const body = await fetchJson<FrankfurterTimeseries>(url);
      if (!body?.rates)
        throw new Error("frankfurter dxy: unexpected response shape");
      const days = Object.keys(body.rates).sort(); // ascending YYYY-MM-DD
      const history: SeriesPoint[] = [];
      for (const day of days) {
        const rates = body.rates[day];
        // A DXY point needs all six constituents present and positive.
        if (
          !rates ||
          !symbols.every(
            (s) =>
              typeof rates[s] === "number" &&
              Number.isFinite(rates[s]) &&
              rates[s] > 0,
          )
        )
          continue;
        let value = DXY_CONSTANT;
        for (const [currency, weight] of Object.entries(DXY_WEIGHTS))
          value *= Math.pow(rates[currency], weight);
        history.push({
          time: new Date(`${day}T00:00:00Z`).getTime(),
          value,
        });
      }
      if (history.length === 0)
        throw new Error("frankfurter dxy: no complete days in window");
      const latest = history[history.length - 1].value;
      const prev =
        history.length > 1 ? history[history.length - 2].value : latest;
      const changePct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
      return { value: latest, changePct, history };
    });
  }
}
