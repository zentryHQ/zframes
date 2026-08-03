import type {
  Capability,
  HomeValueEntry,
  HomeValueIndex,
  MarketDataProvider,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { parseCsvRows } from "@zframes/data-primitives/csv";
import { fetchText } from "@zframes/data-primitives/fetch";

/**
 * Keyless provider for the Zillow Home Value Index (ZHVI) — Zillow's estimate of
 * the *typical* home value in a region (the 33rd–67th percentile band,
 * smoothed and seasonally adjusted), published monthly as a public research CSV.
 * Provides the `home-value-index` capability.
 *
 * Unlike the other house-price sources in the fleet this one is denominated in
 * **dollars**, not index points: FRED's Case-Shiller and the FHFA's HPI both say
 * "prices are 3.3× their base year", while ZHVI says "a typical home here is
 * worth $427,000". That's what makes it worth a separate provider rather than a
 * fourth index series.
 *
 * **No proxy needed** — `files.zillowstatic.com` answers
 * `Access-Control-Allow-Origin: *`, so the browser fetches it direct and these
 * frames keep working on a static host, unlike the proxied official sources.
 *
 * **The file is one big wide table.** Every US metro is a row and every month
 * since 2000-01 is a column (~895 rows × ~318 month columns, ~4.4 MB of text),
 * so a request for one metro and a request for twenty cost the same download.
 * The cache therefore holds the parsed *table* under a constant key and slices
 * per request, meaning one download serves every ZHVI frame on the board instead
 * of one per distinct region list.
 */

const ZHVI_URL =
  "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";

const SOURCE = "Zillow";

/** The five fixed metadata columns before the month columns begin. */
const META_COLUMNS = 5;
const COL_SIZE_RANK = 1;
const COL_REGION_NAME = 2;
const COL_REGION_TYPE = 3;
const COL_STATE = 4;

/**
 * The regions served when a caller names none — the national row plus the
 * largest metros by Zillow's own size rank, spread across regions rather than
 * clustered on one coast. Names must match Zillow's `RegionName` exactly.
 */
const DEFAULT_REGIONS = [
  "United States",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Dallas, TX",
  "Houston, TX",
  "Washington, DC",
  "Miami, FL",
  "Atlanta, GA",
  "Phoenix, AZ",
  "Boston, MA",
  "San Francisco, CA",
  "Seattle, WA",
  "Denver, CO",
  "Austin, TX",
] as const;

/** One parsed region row, before it's narrowed to a caller's request. */
interface RegionRow {
  region: string;
  kind: HomeValueEntry["kind"];
  state?: string;
  sizeRank: number;
  points: SeriesPoint[];
}

/** The whole parsed file: every region, keyed by its published name. */
interface ZhviTable {
  regions: Map<string, RegionRow>;
  /** ISO date of the newest month column present in the file. */
  asOf: string;
}

/**
 * ZHVI publishes once a month (around the 16th), so the TTL is long — 12h keeps
 * a long-lived tab from ever re-downloading the file for nothing while still
 * picking up the monthly print the same day.
 *
 * NOT persisted, for the same reason the LBMA fix history isn't: the parsed table
 * is every metro's full monthly history (~280k numbers), far past what belongs in
 * localStorage next to every other provider's small payloads. The cost of that
 * choice is one 4.4 MB download per cold load, which is the honest price of a
 * source that publishes no per-region endpoint.
 */
const tableCache = new TtlCache<ZhviTable>({
  namespace: "zframes:zillow:zhvi",
  ttlMs: 12 * 60 * 60_000,
  persist: false,
});

function finiteNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const trimmed = cell.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Percent change from `from` to `to`, or undefined when `from` isn't usable. */
function pctChange(from: number | undefined, to: number): number | undefined {
  if (from === undefined || from <= 0) return undefined;
  return ((to - from) / from) * 100;
}

/**
 * Parse the wide ZHVI table into per-region point series.
 *
 * The header is `RegionID,SizeRank,RegionName,RegionType,StateName` followed by
 * one `YYYY-MM-DD` column per month; those dates are the end of each month, so
 * they're used verbatim as the point times. A region's early months are blank
 * until Zillow has enough transactions to publish, so blanks are skipped rather
 * than zero-filled — a zero would draw a chart crashing to the axis.
 */
export function parseZhviCsv(csv: string): ZhviTable {
  const rows = parseCsvRows(csv);
  const header = rows[0] ?? [];
  if (header.length <= META_COLUMNS || header[COL_REGION_NAME] !== "RegionName")
    throw new Error("zillow: unexpected ZHVI CSV header");

  // Month columns → epoch times once, reused for every one of the ~895 rows.
  const times: number[] = [];
  for (let c = META_COLUMNS; c < header.length; c++) {
    times.push(Date.parse(`${header[c].trim()}T00:00:00Z`));
  }

  const regions = new Map<string, RegionRow>();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const region = cells[COL_REGION_NAME]?.trim();
    if (!region) continue;
    const points: SeriesPoint[] = [];
    for (let c = META_COLUMNS; c < cells.length && c < header.length; c++) {
      const value = finiteNumber(cells[c]);
      const time = times[c - META_COLUMNS];
      if (value !== null && Number.isFinite(time)) points.push({ time, value });
    }
    if (points.length === 0) continue;
    const state = cells[COL_STATE]?.trim();
    regions.set(region, {
      region,
      kind: cells[COL_REGION_TYPE]?.trim() === "country" ? "country" : "msa",
      ...(state ? { state } : {}),
      sizeRank: finiteNumber(cells[COL_SIZE_RANK]) ?? 0,
      points,
    });
  }
  if (regions.size === 0)
    throw new Error("zillow: ZHVI CSV had no usable rows");

  const lastTime = times.filter(Number.isFinite).at(-1);
  return {
    regions,
    asOf:
      lastTime === undefined
        ? ""
        : new Date(lastTime).toISOString().slice(0, 10),
  };
}

/** Narrow one parsed region row to the public entry shape. */
function toEntry(row: RegionRow): HomeValueEntry {
  const { points } = row;
  const latest = points[points.length - 1];
  const previous = points[points.length - 2]?.value;
  // A year back is 12 monthly columns, not "the point nearest 365 days ago":
  // the grid is exactly monthly, so indexing is both simpler and exact.
  const yearAgo = points[points.length - 13]?.value;
  const yoy = pctChange(yearAgo, latest.value);
  return {
    region: row.region,
    kind: row.kind,
    ...(row.state ? { state: row.state } : {}),
    sizeRank: row.sizeRank,
    value: latest.value,
    changePctMoM: pctChange(previous, latest.value) ?? 0,
    ...(yoy === undefined ? {} : { changePctYoY: yoy }),
    points,
  };
}

export class ZillowProvider implements MarketDataProvider {
  readonly name = "zillow";
  readonly capabilities: readonly Capability[] = ["home-value-index"];

  /**
   * ZHVI for the requested regions, in request order. Unknown region names are
   * skipped rather than thrown: a board naming one metro Zillow has since
   * renamed should still render the rest, and an empty result surfaces as the
   * frame's own empty state.
   */
  async getHomeValueIndex(regions?: string[]): Promise<HomeValueIndex> {
    const wanted = regions?.length ? regions : [...DEFAULT_REGIONS];
    const table = await tableCache.get("latest", () =>
      fetchText(ZHVI_URL, { timeoutMs: 30_000 }).then(parseZhviCsv),
    );
    const seen = new Set<string>();
    const entries: HomeValueEntry[] = [];
    for (const name of wanted) {
      const key = name.trim();
      if (seen.has(key)) continue;
      const row = table.regions.get(key);
      if (!row) continue;
      seen.add(key);
      entries.push(toEntry(row));
    }
    return { entries, asOf: table.asOf, source: SOURCE };
  }
}
