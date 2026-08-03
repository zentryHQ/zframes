import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZillowProvider as ZillowProviderType } from "./index";

// What this file pins, and why it matters:
//
//  1. **The wide-table shape.** ZHVI is one row per region and one COLUMN per
//     month, with five fixed metadata columns in front. Every value the card
//     shows is read positionally, so an off-by-one in the metadata offset would
//     plot a region's size rank as its first monthly value — a small plausible
//     number where a $400k one belongs.
//  2. **Quoted region names.** `"Austin, TX"` contains the delimiter. Pinned
//     because a naive split shifts every month column by one for exactly those
//     rows (i.e. every metro, but not the national row) — the failure mode the
//     shared CSV primitive exists to prevent.
//  3. **Blank early months are skipped, not zero-filled.** Zillow publishes
//     nothing for a metro until it has the transactions; a zero would draw a
//     chart falling off a cliff in 2000.
//  4. **One download serves every region list.** The cache holds the parsed
//     TABLE under a constant key, so a board with three ZHVI cards on different
//     metros still costs one 4.4 MB fetch, not three.
//  5. **No proxy.** files.zillowstatic.com answers `Access-Control-Allow-Origin:
//     *`, so this provider must fetch DIRECT even in the browser — routing it
//     through the relay would break it on a static host for no reason.
//  6. **Unknown regions are skipped, not fatal**, and month-index arithmetic
//     (MoM = previous column, YoY = 12 columns back) is exact rather than
//     date-approximated.
type Ctor = typeof ZillowProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.ZillowProvider;
}

function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function stubCsv(text: string) {
  const fetchMock = vi.fn().mockResolvedValue(textResponse(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ZHVI_URL =
  "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";

const MONTHS = ["2026-04-30", "2026-05-31", "2026-06-30"];

/** The published header: five metadata columns, then one column per month. */
function header(months: string[] = MONTHS) {
  return ["RegionID,SizeRank,RegionName,RegionType,StateName", ...months].join(
    ",",
  );
}

/** One region row. `name` is quoted here exactly as Zillow quotes it. */
function row(
  id: string,
  sizeRank: number,
  name: string,
  type: string,
  state: string,
  values: (number | string)[],
) {
  const quoted = name.includes(",") ? `"${name}"` : name;
  return [id, sizeRank, quoted, type, state, ...values].join(",");
}

function csv(rows: string[], months: string[] = MONTHS) {
  return [header(months), ...rows, ""].join("\r\n");
}

const US_ROW = row(
  "102001",
  0,
  "United States",
  "country",
  "",
  [370000, 372000, 373000],
);
const AUSTIN_ROW = row(
  "12420",
  29,
  "Austin, TX",
  "msa",
  "TX",
  [420000, 424000, 426943.95],
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ZillowProvider", () => {
  it("advertises only the home-value-index capability", async () => {
    const Provider = await loadProvider();
    expect(new Provider().capabilities).toEqual(["home-value-index"]);
  });

  it("reads the public research CSV DIRECT — no proxy, even in a browser", async () => {
    const Provider = await loadProvider();
    // The host sends Access-Control-Allow-Origin: *, so these frames keep
    // working on a static host with no runtime. Routing through the relay would
    // throw that away.
    vi.stubGlobal("document", {});
    const fetchMock = stubCsv(csv([US_ROW]));
    await new Provider().getHomeValueIndex(["United States"]);
    expect(fetchMock.mock.calls[0][0]).toBe(ZHVI_URL);
  });

  it("parses a quoted region name without shifting its month columns", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([US_ROW, AUSTIN_ROW]));
    const { entries } = await new Provider().getHomeValueIndex(["Austin, TX"]);

    expect(entries).toHaveLength(1);
    const austin = entries[0];
    expect(austin.region).toBe("Austin, TX");
    expect(austin.kind).toBe("msa");
    expect(austin.state).toBe("TX");
    expect(austin.sizeRank).toBe(29);
    // The value is the LAST month column — off-by-one here would return 424000
    // (last month) or 29 (the size rank).
    expect(austin.value).toBe(426943.95);
    expect(austin.points.map((p) => p.value)).toEqual([
      420000, 424000, 426943.95,
    ]);
  });

  it("times each monthly point at the published column date, in UTC", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([US_ROW]));
    const { entries, asOf } = await new Provider().getHomeValueIndex([
      "United States",
    ]);
    expect(entries[0].points.map((p) => p.time)).toEqual([
      Date.UTC(2026, 3, 30),
      Date.UTC(2026, 4, 31),
      Date.UTC(2026, 5, 30),
    ]);
    expect(asOf).toBe("2026-06-30");
  });

  it("marks the national row as a country with no state", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([US_ROW]));
    const { entries } = await new Provider().getHomeValueIndex([
      "United States",
    ]);
    expect(entries[0].kind).toBe("country");
    expect(entries[0].state).toBeUndefined();
    expect(entries[0].sizeRank).toBe(0);
  });

  it("computes month-over-month from the previous column", async () => {
    const Provider = await loadProvider();
    stubCsv(
      csv(
        [row("1", 1, "Testville, TX", "msa", "TX", [100, 110])],
        MONTHS.slice(0, 2),
      ),
    );
    const { entries } = await new Provider().getHomeValueIndex([
      "Testville, TX",
    ]);
    expect(entries[0].changePctMoM).toBeCloseTo(10, 6);
  });

  it("computes year-over-year from exactly 12 columns back", async () => {
    const Provider = await loadProvider();
    // 13 monthly columns: the first is a year before the last.
    const months = Array.from({ length: 13 }, (_, i) =>
      new Date(Date.UTC(2025, 5 + i, 30)).toISOString().slice(0, 10),
    );
    const values = Array.from({ length: 13 }, (_, i) => 100 + i * 5); // 100 … 160
    const Provider2 = Provider;
    stubCsv(csv([row("1", 1, "Testville, TX", "msa", "TX", values)], months));
    const { entries } = await new Provider2().getHomeValueIndex([
      "Testville, TX",
    ]);
    // 100 → 160 twelve months later = +60%. A "nearest point to 365 days ago"
    // search would be off by a month on an irregular grid; indexing is exact.
    expect(entries[0].changePctYoY).toBeCloseTo(60, 6);
  });

  it("omits year-over-year when the region has under a year of history", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([AUSTIN_ROW]));
    const { entries } = await new Provider().getHomeValueIndex(["Austin, TX"]);
    expect(entries[0].changePctYoY).toBeUndefined();
  });

  it("skips blank early months rather than reading them as zero", async () => {
    const Provider = await loadProvider();
    // A metro Zillow had no data for until the third column.
    stubCsv(csv([row("1", 5, "Newtown, NV", "msa", "NV", ["", "", 250000])]));
    const { entries } = await new Provider().getHomeValueIndex(["Newtown, NV"]);
    expect(entries[0].points).toHaveLength(1);
    expect(entries[0].points[0].value).toBe(250000);
    // A zero-filled series would report a −100% collapse instead.
    expect(entries[0].changePctMoM).toBe(0);
  });

  it("returns entries in REQUEST order, not file order", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([US_ROW, AUSTIN_ROW]));
    const { entries } = await new Provider().getHomeValueIndex([
      "Austin, TX",
      "United States",
    ]);
    expect(entries.map((e) => e.region)).toEqual([
      "Austin, TX",
      "United States",
    ]);
  });

  it("skips an unknown region instead of failing the whole card", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([US_ROW, AUSTIN_ROW]));
    const { entries } = await new Provider().getHomeValueIndex([
      "Atlantis, XX",
      "Austin, TX",
    ]);
    expect(entries.map((e) => e.region)).toEqual(["Austin, TX"]);
  });

  it("de-duplicates a repeated region", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([AUSTIN_ROW]));
    const { entries } = await new Provider().getHomeValueIndex([
      "Austin, TX",
      "Austin, TX",
    ]);
    expect(entries).toHaveLength(1);
  });

  it("falls back to its curated default set when given no regions", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([US_ROW, AUSTIN_ROW]));
    const { entries } = await new Provider().getHomeValueIndex();
    // The national row leads the curated list, and Austin is in it.
    expect(entries[0].region).toBe("United States");
    expect(entries.map((e) => e.region)).toContain("Austin, TX");
  });

  it("serves DIFFERENT region lists from ONE download", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubCsv(csv([US_ROW, AUSTIN_ROW]));
    const provider = new Provider();
    await provider.getHomeValueIndex(["United States"]);
    await provider.getHomeValueIndex(["Austin, TX"]);
    // Caching the parsed table (not the per-request slice) is what makes a
    // multi-card board cost one 4.4 MB fetch instead of one per card.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent loads onto a single request", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubCsv(csv([US_ROW]));
    const provider = new Provider();
    await Promise.all([
      provider.getHomeValueIndex(["United States"]),
      provider.getHomeValueIndex(["United States"]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a header that isn't the ZHVI table", async () => {
    const Provider = await loadProvider();
    stubCsv("Region,Value\nAustin,1\n");
    await expect(new Provider().getHomeValueIndex()).rejects.toThrow(
      /unexpected ZHVI CSV header/,
    );
  });

  it("throws when the file has a valid header but no usable rows", async () => {
    const Provider = await loadProvider();
    stubCsv(csv([]));
    await expect(new Provider().getHomeValueIndex()).rejects.toThrow(
      /no usable rows/,
    );
  });

  it("surfaces an upstream failure", async () => {
    const Provider = await loadProvider();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", 503)));
    await expect(new Provider().getHomeValueIndex()).rejects.toThrow(/503/);
  });
});
