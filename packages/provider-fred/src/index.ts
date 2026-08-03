import type {
  Capability,
  MarketDataProvider,
  OfficialSeries,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { parseCsvRows } from "@zframes/data-primitives/csv";
import { fetchText } from "@zframes/data-primitives/fetch";

/**
 * Keyless provider for FRED — the St. Louis Fed's public data warehouse.
 *
 * FRED's *API* needs a registered key, but the endpoint its own charts download
 * from does not: `fredgraph.csv?id=<SERIES_ID>` answers a plain two-column CSV
 * with no key, no token and no signup. That's the surface this provider reads,
 * which is what keeps it inside the keyless fleet.
 *
 * One provider, parameterised by series id (the same shape as provider-metals'
 * multi-metal design) rather than one package per series. It covers four
 * capabilities that differ in meaning but not in shape:
 *
 *  - `index-level` — S&P 500, VIX, Nasdaq Composite levels
 *  - `credit-spread` — the ICE BofA high-yield and investment-grade OAS pair
 *  - `housing-price` — the Case-Shiller US national home-price index
 *  - `mortgage-rate` — the Freddie Mac 30-year fixed benchmark, which FRED
 *    mirrors (so no separate PMMS provider is needed for the same numbers)
 *
 * **CORS:** `fred.stlouisfed.org` sends no `Access-Control-Allow-Origin`, so the
 * browser path goes through the runtime's same-origin proxy (the host is on the
 * serve allowlist) and Node fetches direct. On a static host with no runtime
 * these frames degrade to empty, like every other proxied provider.
 *
 * **Rolling licence windows — not a bug.** Several FRED series are
 * redistributed under licence and only publish a trailing window, so the
 * history is much shorter than the underlying index: `SP500` carries ~10 years
 * and the two BAML spread series ~3, while `NASDAQCOM` (1971), `MORTGAGE30US`
 * (1971) and `CSUSHPINSA` (1987) are deep. A frame asking for 20 years of the
 * S&P 500 gets the 10 that exist rather than an error.
 */

const FREDGRAPH_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";

/** Static metadata per series — everything the CSV itself doesn't tell us. */
interface SeriesDef {
  /** Display label for a card title / chart legend. */
  label: string;
  /** How to read the values (see {@link OfficialSeries.unit}). */
  unit: OfficialSeries["unit"];
  /** Publisher cadence, so a frame can label the latest print honestly. */
  frequency: OfficialSeries["frequency"];
}

/**
 * The series this provider serves. Every id here was confirmed live against
 * `fredgraph.csv` (HTTP 200, real CSV body); an id outside this map is refused
 * rather than passed through, so a typo fails with a clear message instead of
 * a 404 buried in the transport layer.
 */
const SERIES: Record<string, SeriesDef> = {
  SP500: { label: "S&P 500", unit: "index", frequency: "daily" },
  VIXCLS: { label: "VIX", unit: "index", frequency: "daily" },
  NASDAQCOM: {
    label: "Nasdaq Composite",
    unit: "index",
    frequency: "daily",
  },
  BAMLH0A0HYM2: {
    label: "US High Yield OAS",
    unit: "percent",
    frequency: "daily",
  },
  BAMLC0A0CM: {
    label: "US Investment Grade OAS",
    unit: "percent",
    frequency: "daily",
  },
  CSUSHPINSA: {
    label: "Case-Shiller US National",
    unit: "index",
    frequency: "monthly",
  },
  MORTGAGE30US: {
    label: "30Y Fixed Mortgage",
    unit: "percent",
    frequency: "weekly",
  },
};

/** Ids the `index-level` capability accepts — the market-index subset. */
export const FRED_INDEX_SERIES = ["SP500", "VIXCLS", "NASDAQCOM"] as const;

/** The credit-spread pair, high-yield first (the order frames chart them in). */
const CREDIT_SPREAD_SERIES = ["BAMLH0A0HYM2", "BAMLC0A0CM"] as const;

const HOUSING_SERIES = "CSUSHPINSA";
const MORTGAGE_SERIES = "MORTGAGE30US";

const SOURCE = "FRED";

/**
 * Reuse a parsed series for 3h, just under the 6h poll the capability hooks
 * use — background polls still refresh while reloads and sibling frames on the
 * same series reuse one download. Every series here prints daily at best.
 *
 * NOT persisted: the deep series are large as text (Nasdaq's history is ~280 KB,
 * VIX ~160 KB) and several frames may hold different ones, which would crowd
 * localStorage for every other provider's small payloads. Same call the LBMA
 * fix history makes.
 */
const seriesCache = new TtlCache<OfficialSeries[]>({
  namespace: "zframes:fred:series",
  ttlMs: 3 * 60 * 60_000,
  persist: false,
});

/** Coerce a CSV cell to a finite number; empty/"." cells (holidays) yield null. */
function finiteNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const trimmed = cell.trim();
  // FRED leaves non-print days blank in the CSV download (and "." in some
  // legacy exports) — both mean "no observation", not zero.
  if (trimmed === "" || trimmed === ".") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a fredgraph CSV into one point list per value column.
 *
 * The header is `observation_date,<ID>[,<ID>…]` — fredgraph accepts several ids
 * in one `id=A,B` call and answers with one column each on a shared date grid,
 * which is how the credit-spread pair is fetched (one request, dates guaranteed
 * to line up rather than two downloads aligned after the fact).
 *
 * Returns the ids in header order alongside their columns, so the caller matches
 * columns by the id FRED echoed back rather than by request position.
 */
export function parseFredCsv(csv: string): {
  ids: string[];
  columns: SeriesPoint[][];
} {
  const rows = parseCsvRows(csv);
  const header = (rows[0] ?? []).map((cell) => cell.trim());
  if (header.length < 2 || !/^observation_date$/i.test(header[0]))
    throw new Error("fred: unexpected CSV header");
  const ids = header.slice(1);
  const columns: SeriesPoint[][] = ids.map(() => []);

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length < 2) continue;
    // Dates are bare `YYYY-MM-DD`; parse as UTC midnight so the epoch is stable
    // regardless of the viewer's zone (these are daily prints, not intraday).
    const time = Date.parse(`${cells[0].trim()}T00:00:00Z`);
    if (!Number.isFinite(time)) continue;
    for (let c = 0; c < ids.length; c++) {
      const value = finiteNumber(cells[c + 1]);
      if (value !== null) columns[c].push({ time, value });
    }
  }
  return { ids, columns };
}

/** ISO date (`YYYY-MM-DD`) of an epoch, in UTC — matching how the CSV prints it. */
function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * The latest move in the unit a reader expects: a percent change for a level
 * (an index or a dollar amount), but a change in percentage POINTS for a rate
 * or spread — a high-yield OAS going 2.84 → 2.87 is "+3bps", and calling that
 * "+1.06%" would be actively misleading.
 */
function latestChange(points: SeriesPoint[], unit: SeriesDef["unit"]): number {
  if (points.length < 2) return 0;
  const previous = points[points.length - 2].value;
  const latest = points[points.length - 1].value;
  if (unit === "percent") return latest - previous;
  return previous > 0 ? ((latest - previous) / previous) * 100 : 0;
}

/** Assemble the public shape for one parsed column. */
function toOfficialSeries(
  seriesId: string,
  points: SeriesPoint[],
): OfficialSeries {
  const def = SERIES[seriesId];
  if (points.length === 0)
    throw new Error(`fred: series ${seriesId} returned no observations`);
  const latest = points[points.length - 1];
  return {
    seriesId,
    label: def.label,
    unit: def.unit,
    frequency: def.frequency,
    latest: latest.value,
    date: isoDate(latest.time),
    change: latestChange(points, def.unit),
    points,
    source: SOURCE,
  };
}

/** Reject an id this provider doesn't publish, before it reaches the network. */
function knownSeries(seriesId: string): string {
  const id = seriesId.trim().toUpperCase();
  if (!SERIES[id])
    throw new Error(
      `fred: unknown series "${seriesId}" (known: ${Object.keys(SERIES).join(", ")})`,
    );
  return id;
}

export class FredProvider implements MarketDataProvider {
  readonly name = "fred";
  readonly capabilities: readonly Capability[] = [
    "index-level",
    "credit-spread",
    "housing-price",
    "mortgage-rate",
  ];

  /**
   * Fetch + parse one or more series in a single request, cached under the
   * joined id list. Column order follows the ids FRED echoes in the header.
   */
  private load(ids: readonly string[]): Promise<OfficialSeries[]> {
    const key = ids.join(",");
    return seriesCache.get(key, async () => {
      const csv = await fetchText(
        `${FREDGRAPH_URL}?id=${encodeURIComponent(key)}`,
        { proxied: true },
      );
      const { ids: returned, columns } = parseFredCsv(csv);
      return returned.map((id, i) =>
        toOfficialSeries(knownSeries(id), columns[i]),
      );
    });
  }

  private async loadOne(seriesId: string): Promise<OfficialSeries> {
    const [series] = await this.load([knownSeries(seriesId)]);
    return series;
  }

  async getIndexSeries(seriesId: string): Promise<OfficialSeries> {
    return this.loadOne(seriesId);
  }

  /** Both OAS series in ONE call, so their date grids are identical by construction. */
  async getCreditSpreads(): Promise<OfficialSeries[]> {
    return this.load(CREDIT_SPREAD_SERIES);
  }

  async getHousingPriceIndex(): Promise<OfficialSeries> {
    return this.loadOne(HOUSING_SERIES);
  }

  async getMortgageRates(): Promise<OfficialSeries> {
    return this.loadOne(MORTGAGE_SERIES);
  }
}
