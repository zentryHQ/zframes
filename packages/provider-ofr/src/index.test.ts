import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfrProvider as OfrProviderType } from "./index";

// What this file pins, and why it matters:
//
//  1. **Column mapping by fixed index.** The OFR Financial Stress Index is a
//     signed number around zero where the SIGN carries the whole message. The
//     parser reads the overall index from column 1 and the five contribution
//     categories from columns 2–6 by hard-coded index; columns 7–9 are an
//     alternate regional decomposition it deliberately does NOT surface. A
//     one-column shift would render a contribution component as the headline
//     index — a wrong-signed, wrong-magnitude systemic-risk reading that looks
//     perfectly normal on the card. So the mapping is asserted against a row
//     whose ten columns all carry distinguishable values.
//  2. **Row guards.** The <7-cell footer/blank guard, a blank date, a
//     non-numeric index and an unparseable date are each pinned, as is the fact
//     that `time` is parsed at UTC midnight — a local-time parse would slide the
//     whole trend by a day for every viewer east or west of UTC. That last one
//     is only OBSERVABLE at a non-zero UTC offset, so the test pins `TZ` itself
//     rather than trusting the host's zone (see the comment on it).
//  3. **Headline / trend coherence.** `categories` is built from the last
//     PUSHED row, so it can never pair today's index with yesterday's category
//     breakdown even when trailing lines are dropped; `value`/`date` come from
//     the last point (the file runs oldest → newest) and `trend` is the last 90
//     points, ascending.
//  4. **Transport + caching.** www.financialresearch.gov is CORS-walled, so the
//     browser path has to go through the runtime's same-origin proxy while Node
//     fetches direct; the single `"latest"` cache slot dedups concurrent loads,
//     reuses within the 60-minute TTL, serves the last good report on a later
//     failure, and never caches a failure.
//
// `stressCache` is a module-level singleton whose one `"latest"` slot is shared
// by every provider instance and, with stale-on-error on by default, would serve
// a value primed by an earlier test on a later failure — masking every error
// path. So each test gets a genuinely FRESH module (and therefore an empty
// cache) via `vi.resetModules()` + a dynamic import.
type Ctor = typeof OfrProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.OfrProvider;
}

/** A minimal Response-like the stubbed global fetch resolves to (OFR serves CSV). */
function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

const FSI_CSV_URL =
  "https://www.financialresearch.gov/financial-stress-index/data/fsi.csv";

/** The live header: index at column 1, categories 2–6, regional split 7–9. */
const HEADER =
  "Date,OFR FSI,Credit,Equity valuation,Safe assets,Funding," +
  "Volatility,United States,Other advanced economies,Emerging markets";

/** A published file: the header, rows, then the trailing newline the file has. */
function csv(rows: string[]) {
  return [HEADER, ...rows, ""].join("\r\n");
}

/** One full ten-column data row: date, overall index, categories, regional. */
function row(
  date: string,
  index: number | string,
  cats: readonly (number | string)[] = [0.2, 0.3, 0.4, 0.5, 0.6],
  regional: readonly (number | string)[] = [9.1, 9.2, 9.3],
) {
  return [date, index, ...cats, ...regional].join(",");
}

/** Stub fetch so the request resolves with `text`. */
function stubCsv(text: string) {
  const fetchMock = vi.fn().mockResolvedValue(textResponse(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const DAY_MS = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1);

/** Day `i` of a synthetic file: ISO date `2026-01-01 + i`, index `i`. */
function dayRow(i: number) {
  const date = new Date(EPOCH + i * DAY_MS).toISOString().slice(0, 10);
  return row(date, i);
}

describe("OfrProvider", () => {
  let OfrProvider: Ctor;

  beforeEach(async () => {
    // Fresh module → fresh, empty module-level stress cache for this test.
    OfrProvider = await loadProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // Restores the host's zone after the UTC-midnight test pins `TZ`.
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new OfrProvider();
    expect(provider.name).toBe("ofr");
    expect(provider.capabilities).toEqual(["financial-stress"]);
  });

  describe("CSV parsing", () => {
    it("reads the index from column 1 and categories from columns 2–6", async () => {
      stubCsv(
        csv([
          row("2026-06-18", 1.25, [0.2, 0.3, 0.4, 0.5, 0.6], [9.1, 9.2, 9.3]),
        ]),
      );

      const out = await new OfrProvider().getFinancialStress();

      expect(out.value).toBe(1.25);
      expect(out.date).toBe("2026-06-18");
      expect(out.source).toBe("OFR");
      // Exact object: the regional decomposition (9.1/9.2/9.3, columns 7–9) is
      // deliberately NOT surfaced, and any column shift changes a value here.
      expect(out.trend).toEqual([
        {
          time: Date.UTC(2026, 5, 18),
          date: "2026-06-18",
          value: 1.25,
          credit: 0.2,
          equityValuation: 0.3,
          safeAssets: 0.4,
          funding: 0.5,
          volatility: 0.6,
        },
      ]);
      // The five labelled contributions, in CATEGORY_COLUMNS order.
      expect(out.categories).toEqual([
        { label: "Credit", value: 0.2 },
        { label: "Equity valuation", value: 0.3 },
        { label: "Safe assets", value: 0.4 },
        { label: "Funding", value: 0.5 },
        { label: "Volatility", value: 0.6 },
      ]);
    });

    // The parse mode is only observable at a non-zero UTC offset: on a UTC host
    // — which is exactly what CI is, since neither `vitest.config.ts` nor the
    // workflows pin a zone and GitHub's runners are UTC — the local-time parse
    // this test exists to catch (`Date.parse("2026-06-18T00:00:00")`, i.e. the
    // source's template minus its `Z`) yields the SAME epoch as the UTC parse,
    // so an assertion left at the ambient zone passes on the author's laptop and
    // silently no-ops on the only machine that gates a PR. So pin the zone here.
    // Node applies a live `process.env.TZ` change to subsequent date parsing
    // (it fires V8's DateTimeConfigurationChangeNotification), so the stub does
    // reach the `Date.parse` inside the provider; `vi.unstubAllEnvs()` in
    // `afterEach` puts the host's zone back.
    it("stamps `time` at UTC midnight, not host-local midnight", async () => {
      vi.stubEnv("TZ", "America/Los_Angeles");
      // Self-check: if TZ pinning ever stops taking effect, fail loudly right
      // here instead of letting the assertions below decay into tautologies.
      expect(new Date(1_781_740_800_000).getTimezoneOffset()).not.toBe(0);
      stubCsv(csv([row("2026-01-15", 1), row("2026-06-18", 2)]));

      const out = await new OfrProvider().getFinancialStress();

      // Hand-written literals rather than `Date.UTC(…)`: the expectation itself
      // must not be able to slide along with the parse under test. 2026-01-15
      // falls in PST (UTC-8) and 2026-06-18 in PDT (UTC-7), so a local-midnight
      // parse is off by a DIFFERENT amount on each — which also rules out
      // "fixing" a local parse by subtracting one hard-coded offset.
      // The two literals are distinct, so they also pin the row order — no
      // separate `date` assertion needed here (the raw-cell pass-through is
      // already covered by the surrounding row-guard tests).
      expect(out.trend[0].time).toBe(1_768_435_200_000); // 2026-01-15T00:00:00Z
      expect(out.trend[1].time).toBe(1_781_740_800_000); // 2026-06-18T00:00:00Z
    });

    it("drops a line with fewer than seven cells (footer, blank, truncated)", async () => {
      stubCsv(
        csv([
          row("2026-06-17", 1),
          // Six cells and otherwise perfectly valid — dropped on cell count.
          "2026-06-18,2,0.2,0.3,0.4,0.5",
          "Records: 4321",
        ]),
      );

      const out = await new OfrProvider().getFinancialStress();

      expect(out.trend.map((p) => p.date)).toEqual(["2026-06-17"]);
      expect(out.value).toBe(1);
    });

    it("drops rows with a blank date, a non-numeric index or a bad date", async () => {
      stubCsv(
        csv([
          row("2026-06-17", 1),
          row("", 2), // blank date
          row("2026-06-18", "n/a"), // non-numeric index
          row("06/19/2026", 3), // "06/19/2026T00:00:00Z" is unparseable
        ]),
      );

      const out = await new OfrProvider().getFinancialStress();

      expect(out.trend.map((p) => p.date)).toEqual(["2026-06-17"]);
      expect(out.value).toBe(1);
    });

    it("accepts a blank index cell as a reading of exactly 0", async () => {
      stubCsv(csv([row("2026-06-17", 1.4), row("2026-06-18", "")]));

      const out = await new OfrProvider().getFinancialStress();

      // KNOWN BUG: a blank index cell parses as `Number("") === 0`, so a
      // partially-published row is accepted as a reading of exactly 0.00 —
      // "stress precisely at the historical average" — and, being the last row,
      // becomes the headline; it should be skipped like any other unparseable
      // index. Pinned so the suite stays green; fixing the source must flip this
      // assertion. The fix belongs in this provider's local `finiteNumber`
      // (return null for a blank/whitespace-only string), which ALSO flips the
      // blank-category pin in the next test — see the KNOWN BUG note there.
      expect(out.trend).toHaveLength(2);
      expect(out.value).toBe(0);
      expect(out.date).toBe("2026-06-18");
      // And the row's category cells are untouched by the blank index, so the
      // card contradicts itself: a headline of "0.00 — exactly average" above a
      // breakdown that still reports real per-category stress.
      expect(out.categories.map((c) => c.value)).toEqual([
        0.2, 0.3, 0.4, 0.5, 0.6,
      ]);
    });

    it("leaves a non-numeric category absent on the point, and still bars it as 0 in the breakdown", async () => {
      stubCsv(
        csv([
          // A blank Credit cell — the buggy half, pinned below.
          row("2026-06-17", 1, ["", 0.3, 0.4, 0.5, 0.6]),
          // A non-numeric Credit cell — the correct half: the key stays ABSENT.
          row("2026-06-18", 2, ["n/a", 0.31, 0.41, 0.51, 0.61]),
        ]),
      );

      const out = await new OfrProvider().getFinancialStress();

      // KNOWN BUG: a blank Credit cell parses as `Number("") === 0`, so the key
      // attaches and the point records a real zero contribution — "no credit
      // stress" — where the data is merely absent. It should leave `credit` off
      // the point entirely, exactly as the `"n/a"` cell does on the next line
      // (absence IS representable here: every category key on
      // `FinancialStressPoint` is optional, and the source omits the key for any
      // non-finite cell). Same root cause, and same one-line fix, as the blank
      // INDEX cell pinned in the test above — both go through this provider's
      // local `finiteNumber`, so the two pins flip together. Pinned so the suite
      // stays green; fixing the source must flip this assertion to
      // `expect("credit" in out.trend[0]).toBe(false)`.
      expect(out.trend[0].credit).toBe(0);
      expect("credit" in out.trend[1]).toBe(false);
      expect(out.trend[1].equityValuation).toBe(0.31);
      // A DISTINCT question from the coercion above, and intended as landed: the
      // headline breakdown applies an explicit `?? 0` fallback, because
      // `FinancialStressCategory.value` is a required `number` — absence is not
      // representable there — so an unreadable cell renders as a zero bar rather
      // than dropping out of the five-bar breakdown. This survives a
      // `finiteNumber` fix unchanged.
      expect(out.categories).toEqual([
        { label: "Credit", value: 0 },
        { label: "Equity valuation", value: 0.31 },
        { label: "Safe assets", value: 0.41 },
        { label: "Funding", value: 0.51 },
        { label: "Volatility", value: 0.61 },
      ]);
    });

    it("takes the headline and the breakdown from the same surviving row", async () => {
      stubCsv(
        csv([
          row("2026-06-16", 1, [0.11, 0.12, 0.13, 0.14, 0.15]),
          row("2026-06-17", 2, [0.21, 0.22, 0.23, 0.24, 0.25]),
          row("2026-06-18", 3, [0.31, 0.32, 0.33, 0.34, 0.35]),
          // Four trailing lines a partial publish could leave behind — none may
          // pair today's index with yesterday's category breakdown.
          "2026-06-19,4,0.4", // too few cells
          row("", 5), // blank date
          row("bogus", 6), // unparseable date
          row("2026-06-19", "n/a"), // non-numeric index
        ]),
      );

      const out = await new OfrProvider().getFinancialStress();

      expect(out.value).toBe(3);
      expect(out.date).toBe("2026-06-18");
      // A file shorter than the 90-point window keeps every surviving row.
      expect(out.trend.map((p) => p.date)).toEqual([
        "2026-06-16",
        "2026-06-17",
        "2026-06-18",
      ]);
      // The breakdown is the LAST PUSHED row, i.e. the last trend point — not
      // some later, skipped line.
      const last = out.trend[out.trend.length - 1];
      expect(out.categories.map((c) => c.value)).toEqual([
        last.credit,
        last.equityValuation,
        last.safeAssets,
        last.funding,
        last.volatility,
      ]);
      expect(out.categories.map((c) => c.value)).toEqual([
        0.31, 0.32, 0.33, 0.34, 0.35,
      ]);
    });

    it("keeps the last 90 points, ascending, and reads the headline off the newest", async () => {
      const rows = Array.from({ length: 95 }, (_, i) => dayRow(i));
      stubCsv(csv(rows));

      const out = await new OfrProvider().getFinancialStress();

      // 95 rows in, the trailing 90 out (rows 5…94) — oldest → newest.
      expect(out.trend).toHaveLength(90);
      expect(out.trend[0].value).toBe(5);
      expect(out.trend[89].value).toBe(94);
      const times = out.trend.map((p) => p.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(times[0]).toBe(EPOCH + 5 * DAY_MS);
      expect(times[89]).toBe(EPOCH + 94 * DAY_MS);
      // The file is oldest → newest, so the headline is the last row.
      expect(out.value).toBe(94);
      expect(out.date).toBe(
        new Date(EPOCH + 94 * DAY_MS).toISOString().slice(0, 10),
      );
    });

    it("shifts every later column when a field is quoted (known CSV fragility)", async () => {
      // KNOWN FRAGILITY, documented rather than fixed: the parser is a naive
      // `split(",")` with no quoted-field handling. Today's file has no quoted
      // fields, but the moment one appears — here a thousands-separated Credit
      // value `"0,5"` — every later column is read one place to the left, so a
      // category silently reports its NEIGHBOUR's contribution.
      stubCsv(csv(['2026-06-18,1,"0,5",0.2,0.3,0.4,0.5,9.1,9.2,9.3']));

      const out = await new OfrProvider().getFinancialStress();

      // The headline index (column 1) is still correct — the shift starts after.
      expect(out.value).toBe(1);
      // Credit/Equity are unreadable halves of the quoted field …
      expect("credit" in out.trend[0]).toBe(false);
      expect("equityValuation" in out.trend[0]).toBe(false);
      // … and the three that follow report the wrong source column: Safe assets
      // shows Equity's 0.2, Funding shows Safe assets' 0.3, Volatility shows
      // Funding's 0.4.
      expect(out.trend[0].safeAssets).toBe(0.2);
      expect(out.trend[0].funding).toBe(0.3);
      expect(out.trend[0].volatility).toBe(0.4);
    });

    it("throws a labelled error on an empty, headers-only or garbage CSV", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(textResponse(""))
        .mockResolvedValueOnce(textResponse(HEADER))
        .mockResolvedValueOnce(textResponse(csv(["Records: 4321", "junk"])));
      vi.stubGlobal("fetch", fetchMock);
      const provider = new OfrProvider();

      for (let i = 0; i < 3; i++) {
        await expect(provider.getFinancialStress()).rejects.toThrow(
          /ofr fsi: empty or unparseable CSV/,
        );
      }
      // A failure is never cached, so every call retried the load.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws the transport error on a non-2xx response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", 503)));

      await expect(new OfrProvider().getFinancialStress()).rejects.toThrow(
        /failed: 503/,
      );
    });
  });

  describe("transport", () => {
    it("fetches the FSI CSV direct in Node (no proxy hop)", async () => {
      const fetchMock = stubCsv(csv([row("2026-06-18", 1)]));

      await new OfrProvider().getFinancialStress();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(FSI_CSV_URL);
    });

    it("routes through the same-origin proxy in the browser", async () => {
      // Simulate a browser so the shared transport takes its proxy-rewrite
      // branch — www.financialresearch.gov sends no CORS headers.
      vi.stubGlobal("document", {});
      const fetchMock = stubCsv(csv([row("2026-06-18", 1)]));

      await new OfrProvider().getFinancialStress();

      expect(fetchMock.mock.calls[0][0]).toBe(
        `/__zframes/proxy?url=${encodeURIComponent(FSI_CSV_URL)}`,
      );
    });
  });

  describe("caching", () => {
    it("serves the single 'latest' slot to a second instance without re-fetching", async () => {
      const fetchMock = stubCsv(csv([row("2026-06-18", 1.25)]));

      const first = await new OfrProvider().getFinancialStress();
      // A brand-new instance shares the module-level cache — still one fetch.
      const second = await new OfrProvider().getFinancialStress();

      expect(second).toEqual(first);
      expect(second.value).toBe(1.25);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("coalesces concurrent loads onto one fetch", async () => {
      const fetchMock = stubCsv(csv([row("2026-06-18", 1.25)]));
      const provider = new OfrProvider();

      const [a, b] = await Promise.all([
        provider.getFinancialStress(),
        provider.getFinancialStress(),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
      expect(a.value).toBe(1.25);
    });

    it("serves the last good report when a later fetch fails (stale-on-error)", async () => {
      vi.useFakeTimers();
      const fetchMock = stubCsv(csv([row("2026-06-18", 1.25)]));
      const provider = new OfrProvider();
      const good = await provider.getFinancialStress();

      // Let the 60-minute TTL lapse, then fail the refresh.
      vi.advanceTimersByTime(61 * 60_000);
      fetchMock.mockResolvedValueOnce(textResponse("", 503));

      const stale = await provider.getFinancialStress();

      expect(stale).toEqual(good);
      expect(stale.value).toBe(1.25);
      // The stale read still attempted a fresh fetch (which failed).
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
