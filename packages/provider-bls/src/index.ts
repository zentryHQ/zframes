import type {
  Capability,
  MacroPoint,
  MacroSeries,
  MarketDataProvider,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const BLS_SERIES_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const BLS_SERIES_LABELS: Record<string, string> = {
  CUUR0000SA0: "CPI-U all items",
  LNS14000000: "Unemployment rate",
  CES0000000001: "Nonfarm payrolls",
  CES0500000003: "Avg hourly earnings",
  LNS11300000: "Labor force participation",
};

interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: {
    series?: Array<{
      seriesID?: string;
      data?: Array<{
        year?: string;
        period?: string;
        periodName?: string;
        value?: string;
      }>;
    }>;
  };
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function blsPeriodTime(year: string | undefined, period: string | undefined) {
  const match = /^M(0[1-9]|1[0-2])$/.exec(period ?? "");
  const parsedYear = Number(year);
  if (!match || !Number.isFinite(parsedYear)) return null;
  const month = Number(match[1]);
  return Date.UTC(parsedYear, month - 1, 1);
}

function blsPeriodLabel(time: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(time);
}

/**
 * BLS's keyless public API caps unregistered usage at 25 requests/day per IP.
 * CPI is monthly data, so re-fetching on every mount/reload is both wasteful and
 * the quickest way to hit that cap. We cache each series in localStorage (when
 * available) so reloads reuse the last result, and fall back to the last-good
 * value when a request is rejected for the daily cap. Fresh entries skip the
 * network entirely; stale ones are still served if a refetch fails.
 */
const MACRO_CACHE_PREFIX = "zframes:macro:";
const MACRO_FRESH_MS = 6 * 60 * 60_000;

interface CachedMacro {
  at: number;
  series: MacroSeries;
}

function readMacroCache(key: string): CachedMacro | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(MACRO_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMacro;
    return Array.isArray(parsed?.series?.points) ? parsed : null;
  } catch {
    return null;
  }
}

function writeMacroCache(key: string, series: MacroSeries): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      MACRO_CACHE_PREFIX + key,
      JSON.stringify({ at: Date.now(), series } satisfies CachedMacro),
    );
  } catch {
    // ignore quota / serialization errors — the cache is best-effort
  }
}

/**
 * Free, no-API-key provider for the BLS public data API — monthly economic
 * time series such as CPI-U and the unemployment rate. Keyless and CORS-safe,
 * with a low unregistered daily cap (hence the localStorage cache). Provides
 * the `macro-series` capability.
 */
export class BlsProvider implements MarketDataProvider {
  readonly name = "bls";
  readonly capabilities: readonly Capability[] = ["macro-series"];

  /** Collapses concurrent / React-StrictMode double calls onto one request. */
  private macroInflight = new Map<string, Promise<MacroSeries>>();

  async getMacroSeries(
    seriesId: string,
    startYear: number,
    endYear: number,
  ): Promise<MacroSeries> {
    const cacheKey = `${seriesId}:${startYear}:${endYear}`;
    const cached = readMacroCache(cacheKey);
    if (cached && Date.now() - cached.at < MACRO_FRESH_MS) return cached.series;

    const inflight = this.macroInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = this.fetchMacroSeries(seriesId, startYear, endYear)
      .then((series) => {
        writeMacroCache(cacheKey, series);
        return series;
      })
      .catch((error: unknown) => {
        // Serve the last-good value (even if stale) when BLS rejects the
        // request for its keyless daily cap, rather than going blank.
        if (cached) return cached.series;
        throw error;
      })
      .finally(() => {
        this.macroInflight.delete(cacheKey);
      });
    this.macroInflight.set(cacheKey, promise);
    return promise;
  }

  private async fetchMacroSeries(
    seriesId: string,
    startYear: number,
    endYear: number,
  ): Promise<MacroSeries> {
    const url = `${BLS_SERIES_URL}${encodeURIComponent(
      seriesId,
    )}?startyear=${startYear}&endyear=${endYear}`;
    const body = await fetchJson<BlsResponse>(url);
    if (body.status !== "REQUEST_SUCCEEDED")
      throw new Error(
        `bls series ${seriesId}: ${body.message?.join(", ") || "request failed"}`,
      );
    const series = body.Results?.series?.[0];
    if (!series?.data) throw new Error("bls series: unexpected response shape");

    const points: MacroPoint[] = series.data
      .map((entry) => {
        const value = finiteNumber(entry.value);
        const time = blsPeriodTime(entry.year, entry.period);
        if (value === null || time === null) return null;
        return {
          time,
          date: blsPeriodLabel(time),
          value,
          period: `${entry.year}-${entry.period}`,
        };
      })
      .filter((point): point is MacroPoint => point !== null)
      .sort((a, b) => a.time - b.time);

    return {
      seriesId: series.seriesID ?? seriesId,
      label: BLS_SERIES_LABELS[seriesId] ?? seriesId,
      source: "BLS",
      points,
    };
  }
}
