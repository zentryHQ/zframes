import type {
  Capability,
  MarketDataProvider,
  TreasuryAverageRate,
  YieldCurve,
  YieldPoint,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const TREASURY_AVG_RATES_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=20&format=json";

const YIELD_CURVE_URL = (yyyymm: string) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${yyyymm}`;

const USER_AGENT = "zframes (+https://github.com/zentryhq/zframes)";

/** XML field → display label + maturity in months, shortest to longest. */
const MATURITIES: ReadonlyArray<readonly [string, string, number]> = [
  ["BC_1MONTH", "1M", 1],
  ["BC_2MONTH", "2M", 2],
  ["BC_3MONTH", "3M", 3],
  ["BC_4MONTH", "4M", 4],
  ["BC_6MONTH", "6M", 6],
  ["BC_1YEAR", "1Y", 12],
  ["BC_2YEAR", "2Y", 24],
  ["BC_3YEAR", "3Y", 36],
  ["BC_5YEAR", "5Y", 60],
  ["BC_7YEAR", "7Y", 84],
  ["BC_10YEAR", "10Y", 120],
  ["BC_20YEAR", "20Y", 240],
  ["BC_30YEAR", "30Y", 360],
];

interface TreasuryAvgRatesResponse {
  data: Array<{
    record_date?: string;
    security_type_desc?: string;
    security_desc?: string;
    avg_interest_rate_amt?: string;
  }>;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const headers = new Headers();
  // Browsers forbid setting User-Agent; only set a descriptive one in Node.
  if (typeof document === "undefined") headers.set("User-Agent", USER_AGENT);
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.text();
}

function yyyymm(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Parse the latest entry's full curve from the Treasury Atom XML. */
function parseYieldCurve(xml: string): YieldCurve | null {
  const blocks = xml.match(/<m:properties>[\s\S]*?<\/m:properties>/g);
  if (!blocks?.length) return null;
  let best: { date: string; raw: string } | null = null;
  for (const block of blocks) {
    const dateMatch = /<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/.exec(block);
    if (!dateMatch) continue;
    const date = dateMatch[1].slice(0, 10);
    if (!best || date > best.date) best = { date, raw: block };
  }
  if (!best) return null;
  const points: YieldPoint[] = [];
  for (const [field, label, months] of MATURITIES) {
    const m = new RegExp(`<d:${field}[^>]*>([^<]*)</d:${field}>`).exec(
      best.raw,
    );
    const rate = m ? Number(m[1]) : NaN;
    if (Number.isFinite(rate)) points.push({ label, months, rate });
  }
  return points.length ? { date: best.date, points } : null;
}

/**
 * Free, no-API-key provider for the U.S. Treasury Fiscal Data API — average
 * interest rates on outstanding marketable Treasury securities by class
 * (`treasury-rates`, Fiscal Data API) and the daily par yield curve
 * (`yield-curve`, the Treasury data-center XML). Both keyless and CORS-safe.
 */
export class TreasuryProvider implements MarketDataProvider {
  readonly name = "treasury";
  readonly capabilities: readonly Capability[] = [
    "treasury-rates",
    "yield-curve",
  ];

  async getYieldCurve(): Promise<YieldCurve> {
    // The XML is keyed by month; near a month boundary the current month may be
    // empty, so fall back one month. CORS-safe — fetched directly, no proxy.
    const base = new Date();
    for (let back = 0; back <= 1; back++) {
      const month = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - back, 1),
      );
      const xml = await fetchText(YIELD_CURVE_URL(yyyymm(month))).catch(
        () => "",
      );
      const curve = parseYieldCurve(xml);
      if (curve) return curve;
    }
    throw new Error("treasury yield curve: no recent data");
  }

  async getTreasuryAverageRates(): Promise<TreasuryAverageRate[]> {
    const body = await fetchJson<TreasuryAvgRatesResponse>(
      TREASURY_AVG_RATES_URL,
    );
    if (!Array.isArray(body?.data))
      throw new Error("treasury average rates: unexpected response shape");

    const latestDate = body.data.find(
      (entry) => entry.record_date,
    )?.record_date;
    if (!latestDate) return [];
    return body.data
      .filter((entry) => entry.record_date === latestDate)
      .map((entry) => {
        const rate = finiteNumber(entry.avg_interest_rate_amt);
        if (
          rate === null ||
          !entry.security_type_desc ||
          !entry.security_desc
        ) {
          return null;
        }
        return {
          date: latestDate,
          securityType: entry.security_type_desc,
          security: entry.security_desc,
          rate,
        } satisfies TreasuryAverageRate;
      })
      .filter((rate): rate is TreasuryAverageRate => rate !== null);
  }
}
