import type {
  Capability,
  MacroPoint,
  MacroSeries,
  MarketDataProvider,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

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
 * the quickest way to hit that cap. The shared cache persists each series to
 * localStorage so reloads reuse the last result, dedups concurrent / StrictMode
 * double calls, and serves the last good value when a request is rejected for
 * the daily cap. The 6 h TTL sits well under useMacroSeries' 12 h poll. The
 * `revive` guard drops a malformed persisted entry rather than trusting it.
 */
const macroCache = new TtlCache<MacroSeries>({
  namespace: "zframes:macro",
  ttlMs: 6 * 60 * 60_000,
  persist: true,
  revive: (value) =>
    value && Array.isArray((value as MacroSeries).points)
      ? (value as MacroSeries)
      : null,
});

/**
 * Free, no-API-key provider for the BLS public data API — monthly economic
 * time series such as CPI-U and the unemployment rate. Keyless and CORS-safe,
 * with a low unregistered daily cap (hence the localStorage cache). Provides
 * the `macro-series` capability.
 */
export class BlsProvider implements MarketDataProvider {
  readonly name = "bls";
  readonly capabilities: readonly Capability[] = ["macro-series"];

  async getMacroSeries(
    seriesId: string,
    startYear: number,
    endYear: number,
  ): Promise<MacroSeries> {
    return macroCache.get(`${seriesId}:${startYear}:${endYear}`, () =>
      this.fetchMacroSeries(seriesId, startYear, endYear),
    );
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
