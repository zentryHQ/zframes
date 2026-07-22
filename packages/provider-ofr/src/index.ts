import type {
  Capability,
  FinancialStress,
  FinancialStressCategory,
  FinancialStressPoint,
  MarketDataProvider,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchText } from "@zframes/data-primitives/fetch";

const FSI_CSV_URL =
  "https://www.financialresearch.gov/financial-stress-index/data/fsi.csv";

/** Reuse a parsed report for this long — the index updates once a business day. */
const CACHE_TTL_MS = 60 * 60_000;
/** How much recent history to keep for the trend sparkline. */
const TREND_POINTS = 90;

// Single-slot cache (constant key): dedups concurrent loads, reuses the parsed
// CSV within the TTL, and serves the last good report on a transient error
// instead of blanking the card. The FSI updates once a business day, so session-
// scoped caching is enough.
const stressCache = new TtlCache<FinancialStress>({
  namespace: "zframes:ofr:fsi",
  ttlMs: CACHE_TTL_MS,
});

/**
 * The CSV header (verified live):
 *   Date,OFR FSI,Credit,Equity valuation,Safe assets,Funding,Volatility,
 *   United States,Other advanced economies,Emerging markets
 * Column 1 is the overall index; 2–6 are the contribution categories that sum
 * to it; 7–9 are an alternate regional decomposition we don't surface.
 */
const CATEGORY_COLUMNS: ReadonlyArray<readonly [number, string]> = [
  [2, "Credit"],
  [3, "Equity valuation"],
  [4, "Safe assets"],
  [5, "Funding"],
  [6, "Volatility"],
];

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseFsi(csv: string): FinancialStress {
  const lines = csv.split(/\r?\n/);
  const points: FinancialStressPoint[] = [];
  let lastRow: string[] | null = null;
  // Row 0 is the header; skip it. Rows are oldest → newest in the file.
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    if (cells.length < 7) continue;
    const date = cells[0];
    const value = finiteNumber(cells[1]);
    const time = Date.parse(`${date}T00:00:00Z`);
    if (!date || value === null || !Number.isFinite(time)) continue;
    const point: FinancialStressPoint = { time, date, value };
    // Same five category columns as the latest-reading `categories` below,
    // carried per point so a trend consumer (e.g. a stacked category chart)
    // doesn't need a second fetch.
    const credit = finiteNumber(cells[2]);
    const equityValuation = finiteNumber(cells[3]);
    const safeAssets = finiteNumber(cells[4]);
    const funding = finiteNumber(cells[5]);
    const volatility = finiteNumber(cells[6]);
    if (credit !== null) point.credit = credit;
    if (equityValuation !== null) point.equityValuation = equityValuation;
    if (safeAssets !== null) point.safeAssets = safeAssets;
    if (funding !== null) point.funding = funding;
    if (volatility !== null) point.volatility = volatility;
    points.push(point);
    lastRow = cells;
  }
  if (!lastRow || points.length === 0)
    throw new Error("ofr fsi: empty or unparseable CSV");

  const latest = points[points.length - 1];
  const categories: FinancialStressCategory[] = CATEGORY_COLUMNS.map(
    ([col, label]) => ({ label, value: finiteNumber(lastRow![col]) ?? 0 }),
  );

  return {
    value: latest.value,
    date: latest.date,
    categories,
    trend: points.slice(-TREND_POINTS),
    source: "OFR",
  };
}

/**
 * Free, no-API-key provider for the U.S. Office of Financial Research (OFR)
 * Financial Stress Index — a daily, market-based gauge of systemic financial
 * stress where 0 is the historical average (positive = elevated stress,
 * negative = calmer-than-average). Published as a CSV that is CORS-walled, so
 * the browser path goes through the runtime's same-origin proxy
 * (`www.financialresearch.gov` is allowlisted); in Node it fetches direct.
 * Provides the `financial-stress` capability.
 */
export class OfrProvider implements MarketDataProvider {
  readonly name = "ofr";
  readonly capabilities: readonly Capability[] = ["financial-stress"];

  async getFinancialStress(): Promise<FinancialStress> {
    return stressCache.get("latest", () =>
      fetchText(FSI_CSV_URL, { proxied: true }).then(parseFsi),
    );
  }
}
