import type {
  Capability,
  MarketDataProvider,
  RegionalHousingPrice,
  RegionalHousingSeries,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { parseCsvRows } from "@zframes/data-primitives/csv";
import { fetchText } from "@zframes/data-primitives/fetch";

/**
 * Keyless provider for the FHFA House Price Index — the regulator's own
 * repeat-sales index, published quarterly back to **1975**. Provides the
 * `regional-housing-price` capability.
 *
 * Its value over the national Case-Shiller series (`housing-price`, via
 * provider-fred) is **granularity**: FHFA publishes per state and per metro, so
 * a board can show that Texas and California are on different trajectories
 * instead of one national line that averages them away.
 *
 * **Which file to read — a deliberate deviation worth knowing.** The obvious
 * target is the combined `hpi_master.csv`, and it does work: HTTP 200, no key.
 * But it is ~17 MB, which is *over* the runtime proxy's 16 MB relay cap, so in
 * the browser it comes back as a 502 "upstream response too large" — the frame
 * would be permanently empty while every direct `curl` looked fine. The
 * purpose-built per-level files carry the same numbers at a fraction of the size,
 * so this reads those instead:
 *
 *  - state: `hpi_at_state.csv` — **~190 KB**, 51 states (50 + DC), 1975 Q1→
 *  - metro: `hpi_at_metro.csv` — ~4 MB, ~410 metros, 1975 Q1→
 *
 * **Footguns in FHFA's own publishing, all confirmed live:**
 *  - The filenames are **lowercase**. `HPI_master.csv` (as the docs style it)
 *    404s; only `hpi_master.csv` resolves. Same for the files below.
 *  - The `hpi_po_state.csv` / `hpi_po_metro.csv` "purchase-only" files are
 *    actually **XLSX** workbooks behind a `.csv` name (they begin with the `PK`
 *    zip magic), so they cannot be parsed as CSV at all. The all-transactions
 *    (`_at_`) files above are genuine CSV — hence this provider reads those.
 *  - These files have **no header row**; columns are positional.
 *  - The metro file's trailing "change" column uses accounting parentheses
 *    (`( 3.62)`), whose sign convention is not documented alongside the data.
 *    It is ignored: year-over-year is computed from the index series itself,
 *    which is unambiguous.
 *  - `fhfa.gov` sends no CORS header, so the browser path goes through the
 *    runtime's same-origin proxy (the host is on the serve allowlist) and Node
 *    fetches direct. On a static host with no runtime these frames degrade to
 *    empty, like every other proxied provider.
 */

const BASE_URL = "https://www.fhfa.gov/hpi/download/quarterly_datasets";

/** Per-level file + column layout. Both files are headerless and positional. */
const LEVELS = {
  state: {
    /** Lowercase — the capitalised spelling 404s. */
    file: "hpi_at_state.csv",
    /** `state,yr,quarter,index_nsa` */
    columns: { region: 0, year: 1, quarter: 2, index: 3 },
    /** Normalise a caller's region key: state codes are upper-case. */
    normalise: (region: string) => region.trim().toUpperCase(),
  },
  metro: {
    file: "hpi_at_metro.csv",
    /** `metro_name,cbsa,yr,quarter,index_nsa,annual_change` */
    columns: { region: 0, year: 2, quarter: 3, index: 4 },
    normalise: (region: string) => region.trim(),
  },
} as const;

export type HpiLevel = keyof typeof LEVELS;

const SOURCE = "FHFA";

/** How many quarters back a year is — used for the YoY change. */
const QUARTERS_PER_YEAR = 4;

/**
 * One parsed file per level, under the level as the cache key: quarterly data
 * with a long TTL (12h, under the hooks' 24h poll), so every FHFA frame on the
 * board shares one download and a re-render costs nothing.
 *
 * NOT persisted — the metro table is every metro's 50-year quarterly history,
 * which has no business in localStorage beside the small provider payloads (the
 * same call provider-metals makes for the LBMA history).
 */
const levelCache = new TtlCache<Map<string, SeriesPoint[]>>({
  namespace: "zframes:fhfa:hpi",
  ttlMs: 12 * 60 * 60_000,
  persist: false,
});

function finiteNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const trimmed = cell.trim();
  // FHFA writes "-" where a region has no print for that quarter.
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Epoch ms at the first day of a calendar quarter, UTC. */
function quarterStart(year: number, quarter: number): number {
  return Date.UTC(year, (quarter - 1) * 3, 1);
}

/**
 * Parse a headerless FHFA HPI file into one point series per region, keyed by
 * the region as published. Rows arrive grouped by region and ordered oldest →
 * newest, and that order is preserved rather than re-sorted.
 */
export function parseHpiCsv(
  csv: string,
  level: HpiLevel,
): Map<string, SeriesPoint[]> {
  const { columns } = LEVELS[level];
  const series = new Map<string, SeriesPoint[]>();
  for (const cells of parseCsvRows(csv)) {
    const region = cells[columns.region]?.trim();
    const year = finiteNumber(cells[columns.year]);
    const quarter = finiteNumber(cells[columns.quarter]);
    const index = finiteNumber(cells[columns.index]);
    // Skips the "-" placeholder rows a metro carries before its series starts,
    // and would also skip a header row if FHFA ever adds one.
    if (!region || year === null || quarter === null || index === null)
      continue;
    const points = series.get(region) ?? [];
    if (points.length === 0) series.set(region, points);
    points.push({ time: quarterStart(year, quarter), value: index });
  }
  if (series.size === 0)
    throw new Error(`fhfa: ${level} CSV had no usable rows`);
  return series;
}

/** Human-readable period label for a quarter start, e.g. "2026 Q1". */
function periodLabel(time: number): string {
  const date = new Date(time);
  return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/**
 * Resolve a caller's region key against the published keys.
 *
 * Exact match first, then a case-insensitive prefix match — because FHFA names
 * metros by their full CBSA title ("Austin-Round Rock-San Marcos, TX"), which
 * nobody types from memory. Letting "Austin" resolve is what makes the metro
 * level usable at all; state codes always hit the exact path.
 */
function resolveRegion(
  keys: Iterable<string>,
  wanted: string,
): string | undefined {
  const needle = wanted.toLowerCase();
  let prefix: string | undefined;
  for (const key of keys) {
    if (key === wanted) return key;
    const lower = key.toLowerCase();
    if (lower === needle) return key;
    // Keep the shortest prefix match so "Portland" prefers the plain metro over
    // a longer name that merely starts the same way.
    if (
      lower.startsWith(needle) &&
      (prefix === undefined || key.length < prefix.length)
    )
      prefix = key;
  }
  return prefix;
}

export class FhfaProvider implements MarketDataProvider {
  readonly name = "fhfa";
  readonly capabilities: readonly Capability[] = ["regional-housing-price"];

  /**
   * HPI series for the requested regions at one granularity, in request order.
   * An unresolvable region is skipped rather than thrown — one bad key on a
   * multi-region card shouldn't blank the others, and an all-miss request
   * surfaces as the frame's empty state.
   */
  async getRegionalHousingPrice(
    regions: string[],
    level = "state",
  ): Promise<RegionalHousingPrice> {
    const resolved: HpiLevel = level === "metro" ? "metro" : "state";
    const config = LEVELS[resolved];
    const table = await levelCache.get(resolved, () =>
      fetchText(`${BASE_URL}/${config.file}`, {
        proxied: true,
        // The metro file is ~4 MB through the relay; the default 10s is tight.
        timeoutMs: 30_000,
      }).then((csv) => parseHpiCsv(csv, resolved)),
    );

    const series: RegionalHousingSeries[] = [];
    const seen = new Set<string>();
    for (const wanted of regions) {
      const key = resolveRegion(table.keys(), config.normalise(wanted));
      if (key === undefined || seen.has(key)) continue;
      const points = table.get(key);
      if (!points?.length) continue;
      seen.add(key);
      const latest = points[points.length - 1];
      const yearAgo = points[points.length - 1 - QUARTERS_PER_YEAR]?.value;
      series.push({
        region: key,
        latest: latest.value,
        period: periodLabel(latest.time),
        ...(yearAgo !== undefined && yearAgo > 0
          ? { changePctYoY: ((latest.value - yearAgo) / yearAgo) * 100 }
          : {}),
        points,
      });
    }
    return { series, level: resolved, source: SOURCE };
  }
}
