import { afterEach, describe, expect, it, vi } from "vitest";
import type { FhfaProvider as FhfaProviderType } from "./index";

// What this file pins, and why it matters:
//
//  1. **Which file is read.** The obvious `hpi_master.csv` is ~17 MB, over the
//     runtime proxy's 16 MB relay cap, so in the browser it comes back 502 while
//     every `curl` looks fine — a permanently empty card with no visible cause.
//     The URLs asserted here are the small per-level files that work, and the
//     filenames are **lowercase** (the capitalised spelling 404s upstream).
//  2. **Headerless, positional columns, and they DIFFER per level.** State rows
//     are `state,yr,quarter,index`; metro rows are
//     `name,cbsa,yr,quarter,index,change` — the year/quarter/index sit two
//     columns further right. Reading metro rows with the state layout would
//     parse a CBSA code as a year and quietly produce a series in the year 12420.
//  3. **The change column is ignored.** The metro file writes it in accounting
//     parentheses (`( 3.62)`) with no documented sign convention, so
//     year-over-year is computed from the index series instead — pinned as an
//     exact four-quarter comparison.
//  4. **"-" placeholders are skipped**, which is how a metro's pre-history rows
//     are dropped without special-casing them.
//  5. **Prefix matching makes the metro level usable.** FHFA names metros by
//     full CBSA title ("Austin-Round Rock-San Marcos, TX"), which nobody types;
//     "Austin" must resolve, case-insensitively, and the SHORTEST match wins so
//     one metro can't shadow another.
//  6. **The proxy is required** (fhfa.gov sends no CORS header) and one download
//     per level serves every card.
type Ctor = typeof FhfaProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.FhfaProvider;
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

const BASE = "https://www.fhfa.gov/hpi/download/quarterly_datasets";
const STATE_URL = `${BASE}/hpi_at_state.csv`;
const METRO_URL = `${BASE}/hpi_at_metro.csv`;

/** A state file row: `state,yr,quarter,index_nsa` — no header in the real file. */
function stateRow(
  state: string,
  year: number,
  quarter: number,
  index: number | string,
) {
  return [state, year, quarter, index].join(",");
}

/** A metro row: `"name",cbsa,yr,quarter,index_nsa,annual_change`. */
function metroRow(
  name: string,
  cbsa: string,
  year: number,
  quarter: number,
  index: number | string,
  change = "( 3.62)",
) {
  return [`"${name}"`, cbsa, year, quarter, index, change].join(",");
}

/** Four quarters of a year for one state, so YoY has something to compare. */
function stateYear(state: string, year: number, values: number[]) {
  return values.map((v, i) => stateRow(state, year, i + 1, v));
}

function csv(rows: string[]) {
  return [...rows, ""].join("\r\n");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FhfaProvider", () => {
  it("advertises only the regional-housing-price capability", async () => {
    const Provider = await loadProvider();
    expect(new Provider().capabilities).toEqual(["regional-housing-price"]);
  });

  describe("state level", () => {
    it("reads the small lowercase per-level file, not the 17 MB master", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv(stateYear("TX", 2026, [500, 510, 520, 529.31])),
      );
      await new Provider().getRegionalHousingPrice(["TX"]);
      const url = fetchMock.mock.calls[0][0] as string;
      // Lowercase (HPI_master.csv / HPI_at_state.csv 404 upstream) and NOT the
      // over-the-relay-cap combined file.
      expect(url).toBe(STATE_URL);
      expect(url).not.toContain("hpi_master");
      expect(url).not.toContain("HPI_");
    });

    it("parses the headerless positional layout", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([stateRow("TX", 1975, 1, 55.99), stateRow("TX", 2026, 1, 529.31)]),
      );
      const { series, level, source } =
        await new Provider().getRegionalHousingPrice(["TX"]);

      expect(level).toBe("state");
      expect(source).toBe("FHFA");
      expect(series).toHaveLength(1);
      expect(series[0].region).toBe("TX");
      expect(series[0].latest).toBe(529.31);
      expect(series[0].period).toBe("2026 Q1");
      expect(series[0].points.map((p) => p.value)).toEqual([55.99, 529.31]);
    });

    it("times each point at the first day of its quarter, in UTC", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          stateRow("TX", 2026, 1, 500),
          stateRow("TX", 2026, 2, 510),
          stateRow("TX", 2026, 3, 520),
          stateRow("TX", 2026, 4, 530),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(["TX"]);
      expect(series[0].points.map((p) => p.time)).toEqual([
        Date.UTC(2026, 0, 1),
        Date.UTC(2026, 3, 1),
        Date.UTC(2026, 6, 1),
        Date.UTC(2026, 9, 1),
      ]);
    });

    it("computes year-over-year from exactly four quarters back", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          ...stateYear("TX", 2025, [100, 102, 104, 106]),
          ...stateYear("TX", 2026, [110, 112, 114, 120]),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(["TX"]);
      // Latest is 2026 Q4 = 120; four quarters back is 2025 Q4 = 106.
      expect(series[0].changePctYoY).toBeCloseTo(((120 - 106) / 106) * 100, 6);
    });

    it("omits year-over-year with fewer than five quarters of history", async () => {
      const Provider = await loadProvider();
      stubCsv(csv(stateYear("TX", 2026, [100, 102, 104, 106])));
      const { series } = await new Provider().getRegionalHousingPrice(["TX"]);
      expect(series[0].changePctYoY).toBeUndefined();
    });

    it("upper-cases a state code so 'tx' resolves", async () => {
      const Provider = await loadProvider();
      stubCsv(csv([stateRow("TX", 2026, 1, 529.31)]));
      const { series } = await new Provider().getRegionalHousingPrice(["tx"]);
      expect(series[0].region).toBe("TX");
    });

    it("returns series in REQUEST order, not file order", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          stateRow("CA", 2026, 1, 900),
          stateRow("FL", 2026, 1, 700),
          stateRow("TX", 2026, 1, 529),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice([
        "TX",
        "CA",
      ]);
      expect(series.map((s) => s.region)).toEqual(["TX", "CA"]);
    });

    it("skips an unresolvable region instead of failing the card", async () => {
      const Provider = await loadProvider();
      stubCsv(csv([stateRow("TX", 2026, 1, 529)]));
      const { series } = await new Provider().getRegionalHousingPrice([
        "ZZ",
        "TX",
      ]);
      expect(series.map((s) => s.region)).toEqual(["TX"]);
    });

    it("returns an empty series list when nothing matches", async () => {
      const Provider = await loadProvider();
      stubCsv(csv([stateRow("TX", 2026, 1, 529)]));
      const { series } = await new Provider().getRegionalHousingPrice(["ZZ"]);
      // The frame renders its own empty state; this is not an error.
      expect(series).toEqual([]);
    });

    it("skips '-' placeholder rows", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          stateRow("TX", 1975, 1, "-"),
          stateRow("TX", 1975, 2, "-"),
          stateRow("TX", 2026, 1, 529.31),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(["TX"]);
      expect(series[0].points).toHaveLength(1);
    });

    it("would skip a header row if FHFA ever added one", async () => {
      const Provider = await loadProvider();
      // The non-numeric year/index guard doubles as a header guard.
      stubCsv(
        csv(["state,yr,quarter,index_nsa", stateRow("TX", 2026, 1, 529.31)]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(["TX"]);
      expect(series[0].points).toHaveLength(1);
    });
  });

  describe("metro level", () => {
    it("reads the metro file with the metro column layout", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv([
          metroRow("Austin-Round Rock-San Marcos, TX", "12420", 2026, 1, 502.8),
        ]),
      );
      const { series, level } = await new Provider().getRegionalHousingPrice(
        ["Austin-Round Rock-San Marcos, TX"],
        "metro",
      );

      expect(fetchMock.mock.calls[0][0]).toBe(METRO_URL);
      expect(level).toBe("metro");
      // Year/quarter/index come from columns 2/3/4 here, not 1/2/3 — the state
      // layout would read the CBSA code 12420 as the year.
      expect(series[0].latest).toBe(502.8);
      expect(series[0].period).toBe("2026 Q1");
      expect(series[0].points[0].time).toBe(Date.UTC(2026, 0, 1));
    });

    it("ignores the parenthesised change column entirely", async () => {
      const Provider = await loadProvider();
      // `( 3.62)` has no documented sign convention, so the provider must not
      // read it — YoY comes from the index series.
      stubCsv(
        csv([
          metroRow("Testville, TX", "11111", 2025, 1, 100, "( 3.62)"),
          metroRow("Testville, TX", "11111", 2025, 2, 100, "( 9.99)"),
          metroRow("Testville, TX", "11111", 2025, 3, 100, "-"),
          metroRow("Testville, TX", "11111", 2025, 4, 100, "( 1.00)"),
          metroRow("Testville, TX", "11111", 2026, 1, 110, "( 2.00)"),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(
        ["Testville, TX"],
        "metro",
      );
      // 100 → 110 four quarters later = +10%, regardless of what the column said.
      expect(series[0].changePctYoY).toBeCloseTo(10, 6);
    });

    it("resolves a leading fragment of the CBSA title, case-insensitively", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          metroRow("Austin-Round Rock-San Marcos, TX", "12420", 2026, 1, 502.8),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(
        ["austin"],
        "metro",
      );
      // Without this the metro level is unusable — nobody types the full title.
      expect(series[0].region).toBe("Austin-Round Rock-San Marcos, TX");
    });

    it("prefers an exact match over a prefix match", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          metroRow("Portland, ME", "38860", 2026, 1, 300),
          metroRow(
            "Portland-Vancouver-Hillsboro, OR-WA",
            "38900",
            2026,
            1,
            400,
          ),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(
        ["Portland, ME"],
        "metro",
      );
      expect(series[0].region).toBe("Portland, ME");
      expect(series[0].latest).toBe(300);
    });

    it("picks the SHORTEST prefix match when several share a prefix", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          metroRow(
            "Portland-Vancouver-Hillsboro, OR-WA",
            "38900",
            2026,
            1,
            400,
          ),
          metroRow("Portland, ME", "38860", 2026, 1, 300),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(
        ["Portland"],
        "metro",
      );
      // Deterministic regardless of file order, so a re-published file can't
      // silently swap which metro a card shows.
      expect(series[0].region).toBe("Portland, ME");
    });

    it("keeps a metro name's comma intact (it is a quoted field)", async () => {
      const Provider = await loadProvider();
      stubCsv(csv([metroRow("Abilene, TX", "10180", 2026, 1, 250)]));
      const { series } = await new Provider().getRegionalHousingPrice(
        ["Abilene, TX"],
        "metro",
      );
      expect(series[0].region).toBe("Abilene, TX");
      expect(series[0].latest).toBe(250);
    });

    it("de-duplicates two keys that resolve to the same metro", async () => {
      const Provider = await loadProvider();
      stubCsv(
        csv([
          metroRow("Austin-Round Rock-San Marcos, TX", "12420", 2026, 1, 502.8),
        ]),
      );
      const { series } = await new Provider().getRegionalHousingPrice(
        ["Austin", "austin-round"],
        "metro",
      );
      expect(series).toHaveLength(1);
    });
  });

  describe("transport and caching", () => {
    it("routes through the same-origin proxy in the browser", async () => {
      const Provider = await loadProvider();
      // fhfa.gov sends no Access-Control-Allow-Origin, so without the relay the
      // frame is permanently empty in a browser.
      vi.stubGlobal("document", {});
      const fetchMock = stubCsv(csv([stateRow("TX", 2026, 1, 529)]));
      await new Provider().getRegionalHousingPrice(["TX"]);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `/__zframes/proxy?url=${encodeURIComponent(STATE_URL)}`,
      );
    });

    it("fetches direct in Node", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv([stateRow("TX", 2026, 1, 529)]));
      await new Provider().getRegionalHousingPrice(["TX"]);
      expect(fetchMock.mock.calls[0][0]).toBe(STATE_URL);
    });

    it("serves different region lists at one level from ONE download", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(
        csv([stateRow("TX", 2026, 1, 529), stateRow("CA", 2026, 1, 900)]),
      );
      const provider = new Provider();
      await provider.getRegionalHousingPrice(["TX"]);
      await provider.getRegionalHousingPrice(["CA"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("caches per level, so switching to metro still fetches", async () => {
      const Provider = await loadProvider();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          textResponse(csv([stateRow("TX", 2026, 1, 529)])),
        )
        .mockResolvedValueOnce(
          textResponse(csv([metroRow("Abilene, TX", "10180", 2026, 1, 250)])),
        );
      vi.stubGlobal("fetch", fetchMock);
      const provider = new Provider();
      await provider.getRegionalHousingPrice(["TX"]);
      await provider.getRegionalHousingPrice(["Abilene, TX"], "metro");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(METRO_URL);
    });

    it("treats an unrecognised level as state rather than failing", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv([stateRow("TX", 2026, 1, 529)]));
      const { level } = await new Provider().getRegionalHousingPrice(
        ["TX"],
        "county",
      );
      expect(level).toBe("state");
      expect(fetchMock.mock.calls[0][0]).toBe(STATE_URL);
    });

    it("coalesces concurrent loads onto a single request", async () => {
      const Provider = await loadProvider();
      const fetchMock = stubCsv(csv([stateRow("TX", 2026, 1, 529)]));
      const provider = new Provider();
      await Promise.all([
        provider.getRegionalHousingPrice(["TX"]),
        provider.getRegionalHousingPrice(["TX"]),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws when the file parses to no rows at all", async () => {
      const Provider = await loadProvider();
      stubCsv(csv(["", "junk"]));
      await expect(
        new Provider().getRegionalHousingPrice(["TX"]),
      ).rejects.toThrow(/no usable rows/);
    });

    it("surfaces an upstream failure (e.g. the relay's size cap)", async () => {
      const Provider = await loadProvider();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", 502)));
      await expect(
        new Provider().getRegionalHousingPrice(["TX"]),
      ).rejects.toThrow(/502/);
    });
  });
});
