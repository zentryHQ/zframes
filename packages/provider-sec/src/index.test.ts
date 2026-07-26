import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecProvider as SecProviderType } from "./index";
import { padCik, resolveCik } from "./tickers";

// What this file pins
// ───────────────────
// SecProvider is the largest body of bespoke parsing in the provider fleet, and
// it feeds "as reported" fundamentals cards that are deliberately exempt from the
// currency layer — a wrong number here has no cross-check anywhere in the app.
// The contracts guarded below are the ones whose silent inversion would swap a
// correct figure for a plausible-looking wrong one:
//
//  1. pickEntry's period selection — a "flow" (income-statement) metric prefers
//     the latest `fp: "FY"` print EVEN WHEN a Q/YTD entry has a later `end`
//     (the FY-pool filter runs BEFORE the latest-by-end reduce), while an
//     "instant" (balance-sheet) metric is purely latest-by-end. Flipping that
//     order would quietly report a quarter as the annual figure. NOTE the real
//     scope: that guarantee holds only WITHIN a single concept. pickEntry runs
//     per concept, and the cross-concept reduce (2) then compares `end` alone,
//     so an FY-only concept loses to a quarter-only concept ending later — the
//     failure this bullet describes, still live. Pinned as a KNOWN BUG by
//     "lets a quarter-only later concept beat an FY-only earlier one".
//  2. The cross-concept scan keeps the entry with the latest `end` across a
//     metric's WHOLE concept list — not "first concept that exists wins" — so a
//     filer's tag migration (Revenues → RevenueFromContractWith…) can't pin the
//     card to a stale value.
//  3. Unit-key + taxonomy routing (USD / USD/shares / shares, us-gaap vs dei):
//     a value reported only under another unit key or taxonomy is dropped, never
//     coerced.
//  4. Entry hygiene (missing end/form, non-finite val) and the
//     "no headline metrics found" throw, which is what lets the TtlCache serve
//     the last good value instead of blanking the card.
//  5. The proxy split MUST NOT converge: companyfacts sends `proxied: true`
//     (no CORS header upstream → same-origin proxy in the browser) while
//     submissions goes direct. Losing that flag breaks fundamentals in every
//     browser while still passing in Node, so both paths are asserted together.
//  6. CIK plumbing: padCik / resolveCik input forms, and filingUrl's Archives
//     path, which strips LEADING ZEROS from the CIK and dashes from the
//     accession number (a link that 404s is a silently broken card).
//
// The two module-level TtlCaches (filings / facts) are singletons keyed by CIK
// with stale-on-error ON, so a good value primed by one test would mask every
// error path in the next. Every test therefore gets a genuinely FRESH module
// (empty caches) via vi.resetModules() + a dynamic import.

type Ctor = typeof SecProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.SecProvider;
}

const PROXY_PREFIX = "/__zframes/proxy?url=";
const NODE_DEFAULT_UA = "zframes (+https://github.com/zentryhq/zframes)";

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** [substring of the UPSTREAM url, body to answer with]. */
type Route = [match: string, body: unknown];

/**
 * Stub global fetch, routing on the UPSTREAM url: a proxy-wrapped target is
 * decoded first, so one router serves the direct and proxied paths alike and an
 * unexpected host fails loudly instead of silently answering the wrong fixture.
 */
function stubFetch(routes: Route[]) {
  const mock = vi.fn(async (target: string, _init?: RequestInit) => {
    const upstream = target.startsWith(PROXY_PREFIX)
      ? decodeURIComponent(target.slice(PROXY_PREFIX.length))
      : target;
    const hit = routes.find(([match]) => upstream.includes(match));
    if (!hit) throw new Error(`test: unrouted fetch → ${target}`);
    return jsonResponse(hit[1]);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

type FetchMock = ReturnType<typeof stubFetch>;

/** The target the global fetch was called with on the Nth call. */
function fetchTarget(mock: FetchMock, n = 0): string {
  return mock.mock.calls[n][0];
}

/** The User-Agent the Nth outgoing request carried, or null when unset. */
function fetchUa(mock: FetchMock, n = 0): string | null {
  return new Headers(mock.mock.calls[n][1]?.headers).get("User-Agent");
}

// ── XBRL companyfacts fixtures ──────────────────────────────────────────────

interface Entry {
  end?: string;
  val?: unknown;
  fy?: number;
  fp?: string;
  form?: string;
}

/** One XBRL concept whose single `unit` key holds `entries`. */
function concept(unit: string, entries: Entry[]) {
  return { units: { [unit]: entries } };
}

function factsBody(
  facts: {
    "us-gaap"?: Record<string, unknown>;
    dei?: Record<string, unknown>;
  },
  meta: { cik?: number; entityName?: string } = {},
) {
  return { cik: 320193, entityName: "Apple Inc.", ...meta, facts };
}

/** A single balance-sheet metric — enough to keep extractMetrics non-empty. */
const ASSETS_ONLY = {
  Assets: concept("USD", [
    {
      end: "2025-09-27",
      val: 344_085_000_000,
      fy: 2025,
      fp: "FY",
      form: "10-K",
    },
  ]),
};

/** A minimal submissions payload with an empty recent-filings block. */
const EMPTY_SUBMISSIONS = {
  cik: "320193",
  filings: { recent: { accessionNumber: [], form: [], filingDate: [] } },
};

describe("SecProvider", () => {
  let SecProvider: Ctor;

  beforeEach(async () => {
    // Fresh module → fresh, empty module-level filings/facts caches.
    SecProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("identity", () => {
    it("advertises exactly the filings + fundamentals capabilities", () => {
      const provider = new SecProvider();
      expect(provider.name).toBe("sec");
      expect([...provider.capabilities]).toEqual(["filings", "fundamentals"]);
    });
  });

  // ── tickers.ts ────────────────────────────────────────────────────────────

  describe("resolveCik / padCik", () => {
    it("resolves a bare ticker from the bundled map to a 10-digit CIK", () => {
      expect(resolveCik("AAPL")).toBe("0000320193");
      // Case-insensitive, and a dash in a share class survives the scrub.
      expect(resolveCik("aapl")).toBe("0000320193");
      expect(resolveCik("BRK-B")).toBe("0001067983");
    });

    it("strips a HIP-3 dex prefix before looking the ticker up", () => {
      // "xyz:TSLA" is how equity perps are named; only the part after the last
      // colon is a ticker.
      expect(resolveCik("xyz:TSLA")).toBe("0001318605");
      expect(resolveCik("TSLA")).toBe("0001318605");
    });

    it("accepts a raw CIK and the CIK-prefixed form, zero-padding both", () => {
      expect(resolveCik("320193")).toBe("0000320193");
      expect(resolveCik("CIK0000320193")).toBe("0000320193");
      expect(resolveCik("1800")).toBe("0000001800");
      // Surrounding whitespace is trimmed before classification.
      expect(resolveCik("  320193  ")).toBe("0000320193");
    });

    it("returns null for a ticker outside the bundled snapshot", () => {
      expect(resolveCik("ZZZZ")).toBeNull();
      expect(resolveCik("xyz:NOTATICKER")).toBeNull();
    });

    it("pads a numeric CIK and drops non-digits", () => {
      expect(padCik(320193)).toBe("0000320193");
      expect(padCik("1800")).toBe("0000001800");
      expect(padCik("CIK0000320193")).toBe("0000320193");
    });

    it("throws the labelled unknown-ticker error BEFORE any fetch", async () => {
      const mock = stubFetch([["data.sec.gov", {}]]);
      const provider = new SecProvider();

      await expect(provider.getCompanyFacts("ZZZZ")).rejects.toThrow(
        /sec: unknown ticker "ZZZZ" — not in the bundled map/,
      );
      await expect(provider.getCompanyFilings("ZZZZ")).rejects.toThrow(
        /sec: unknown ticker "ZZZZ" — not in the bundled map/,
      );
      // Resolution happens before the cache/fetch, so no request went out.
      expect(mock).not.toHaveBeenCalled();
    });
  });

  // ── fundamentals: period selection ────────────────────────────────────────

  describe("fundamentals — period selection (pickEntry)", () => {
    it('prefers the latest fp:"FY" print for a flow metric even when a quarter ends later', async () => {
      // THE contract: the FY-pool filter runs before the latest-by-end reduce,
      // so the Q2 entry (later `end`) must NOT win a flow metric.
      const mock = stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              NetIncomeLoss: concept("USD", [
                {
                  end: "2025-09-27",
                  val: 112_010_000_000,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
                {
                  end: "2026-03-28",
                  val: 23_600_000_000,
                  fy: 2026,
                  fp: "Q2",
                  form: "10-Q",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics).toEqual([
        {
          label: "Net income",
          value: 112_010_000_000,
          unit: "USD",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
      ]);
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("takes the latest end for an instant metric regardless of fp", async () => {
      // Balance-sheet figures are point-in-time: the Q2 print is the newest
      // truth and must beat the FY one.
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              Assets: concept("USD", [
                {
                  end: "2025-09-27",
                  val: 344_085_000_000,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
                {
                  end: "2026-03-28",
                  val: 331_000_000_000,
                  fy: 2026,
                  fp: "Q2",
                  form: "10-Q",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics).toEqual([
        {
          label: "Total assets",
          value: 331_000_000_000,
          unit: "USD",
          end: "2026-03-28",
          fiscalPeriod: "Q2 2026",
          form: "10-Q",
        },
      ]);
    });

    it("falls back to the latest entry of any period when a flow metric has no FY print", async () => {
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              NetIncomeLoss: concept("USD", [
                {
                  end: "2026-03-28",
                  val: 23_000_000_000,
                  fy: 2026,
                  fp: "Q2",
                  form: "10-Q",
                },
                // No fy / fp at all — still a candidate, and its label degrades
                // to the raw period end.
                { end: "2026-06-27", val: 25_000_000_000, form: "10-Q" },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics[0].value).toBe(25_000_000_000);
      expect(facts.metrics[0].end).toBe("2026-06-27");
      expect(facts.metrics[0].fiscalPeriod).toBe("2026-06-27");
    });
  });

  // ── fundamentals: cross-concept scan ─────────────────────────────────────

  describe("fundamentals — cross-concept latest-wins (tag migration)", () => {
    it("prefers a newer LATER-listed concept over a stale first-listed one", async () => {
      // The discriminating case: RevenueFromContractWithCustomerExcludingAssessedTax
      // is FIRST in the concept list but stale, and Revenues is second but
      // current. "First concept that exists wins" would report the 2019 figure.
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              RevenueFromContractWithCustomerExcludingAssessedTax: concept(
                "USD",
                [
                  {
                    end: "2019-09-28",
                    val: 260_174_000_000,
                    fy: 2019,
                    fp: "FY",
                    form: "10-K",
                  },
                ],
              ),
              Revenues: concept("USD", [
                {
                  end: "2025-09-27",
                  val: 416_161_000_000,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics).toHaveLength(1);
      expect(facts.metrics[0].label).toBe("Revenue");
      expect(facts.metrics[0].value).toBe(416_161_000_000);
      expect(facts.metrics[0].fiscalPeriod).toBe("FY2025");
    });

    it("keeps a newer first-listed concept when the stale one is Revenues", async () => {
      // Same rule in the direction filers actually migrated: a present-but-stale
      // Revenues loses to the newer contract-revenue tag.
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              RevenueFromContractWithCustomerExcludingAssessedTax: concept(
                "USD",
                [
                  {
                    end: "2025-09-27",
                    val: 416_161_000_000,
                    fy: 2025,
                    fp: "FY",
                    form: "10-K",
                  },
                ],
              ),
              Revenues: concept("USD", [
                {
                  end: "2018-09-29",
                  val: 265_595_000_000,
                  fy: 2018,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
              SalesRevenueNet: concept("USD", [
                {
                  end: "2017-09-30",
                  val: 229_234_000_000,
                  fy: 2017,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics[0].value).toBe(416_161_000_000);
      expect(facts.metrics[0].end).toBe("2025-09-27");
    });

    it("lets a quarter-only later concept beat an FY-only earlier one", async () => {
      // KNOWN BUG: a flow metric reports the Q2 print — 90e9, "Q2 2026" —
      // under the annual "Revenue" label; it should report the FY2025 print
      // (400e9, "FY2025"), because a flow metric with an FY print anywhere in
      // its concept list must never quote a quarter as the annual figure.
      // Why it happens: pickEntry's FY-pool filter is PER CONCEPT, so the
      // FY-only concept yields FY2025 and the quarter-only concept yields Q2
      // (it has no FY entry to prefer); extractMetrics then reduces the two
      // candidates on `end` alone, and the later quarter wins. The two other
      // cross-concept tests here can't catch it — every concept in those has an
      // FY print, so the reduce only ever compares FY against FY.
      // Real filers land in exactly this shape mid-migration: the retired tag
      // still carries the last 10-K's FY print while the new tag carries only
      // 10-Q prints until the next annual report, which is when the card starts
      // showing one quarter of revenue next to a full year of net income.
      // The fix belongs in extractMetrics (carry the FY preference into the
      // cross-concept reduce, e.g. prefer an `fp: "FY"` candidate and only fall
      // back to latest-`end` among equals), so this test pins today's output.
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              // FY-only, and the EARLIER of the two period ends.
              RevenueFromContractWithCustomerExcludingAssessedTax: concept(
                "USD",
                [
                  {
                    end: "2025-09-27",
                    val: 400_000_000_000,
                    fy: 2025,
                    fp: "FY",
                    form: "10-K",
                  },
                ],
              ),
              // Quarter-only, and the LATER period end.
              Revenues: concept("USD", [
                {
                  end: "2026-03-28",
                  val: 90_000_000_000,
                  fy: 2026,
                  fp: "Q2",
                  form: "10-Q",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics).toEqual([
        {
          label: "Revenue",
          value: 90_000_000_000,
          unit: "USD",
          end: "2026-03-28",
          fiscalPeriod: "Q2 2026",
          form: "10-Q",
        },
      ]);
    });

    it("falls back to EarningsPerShareBasic under the Diluted EPS label", async () => {
      // The concept list is a preference order, not a rename: the label stays
      // "Diluted EPS" while the value comes from the basic tag.
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              EarningsPerShareBasic: concept("USD/shares", [
                {
                  end: "2025-09-27",
                  val: 7.5,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics).toEqual([
        {
          label: "Diluted EPS",
          value: 7.5,
          unit: "USD/shares",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
      ]);
    });
  });

  // ── fundamentals: unit key + taxonomy routing ────────────────────────────

  describe("fundamentals — unit key and taxonomy routing", () => {
    it("reads each metric from its own unit key and taxonomy, in display order", async () => {
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              RevenueFromContractWithCustomerExcludingAssessedTax: concept(
                "USD",
                [
                  {
                    end: "2025-09-27",
                    val: 416_161_000_000,
                    fy: 2025,
                    fp: "FY",
                    form: "10-K",
                  },
                ],
              ),
              NetIncomeLoss: concept("USD", [
                {
                  end: "2025-09-27",
                  val: 112_010_000_000,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
              Assets: concept("USD", [
                {
                  end: "2025-09-27",
                  val: 344_085_000_000,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
              StockholdersEquity: concept("USD", [
                {
                  end: "2025-09-27",
                  val: 66_800_000_000,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
              EarningsPerShareDiluted: concept("USD/shares", [
                {
                  end: "2025-09-27",
                  val: 7.46,
                  fy: 2025,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
            },
            dei: {
              EntityCommonStockSharesOutstanding: concept("shares", [
                {
                  end: "2025-10-17",
                  val: 14_840_000_000,
                  fy: 2026,
                  fp: "Q1",
                  form: "10-K",
                },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      // The numeric body `cik` is zero-padded to the 10-digit form.
      expect(facts.cik).toBe("0000320193");
      expect(facts.entityName).toBe("Apple Inc.");
      expect(facts.metrics).toEqual([
        {
          label: "Revenue",
          value: 416_161_000_000,
          unit: "USD",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
        {
          label: "Net income",
          value: 112_010_000_000,
          unit: "USD",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
        {
          label: "Total assets",
          value: 344_085_000_000,
          unit: "USD",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
        {
          label: "Shareholders' equity",
          value: 66_800_000_000,
          unit: "USD",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
        {
          label: "Diluted EPS",
          value: 7.46,
          unit: "USD/shares",
          end: "2025-09-27",
          fiscalPeriod: "FY2025",
          form: "10-K",
        },
        {
          label: "Shares outstanding",
          value: 14_840_000_000,
          unit: "shares",
          end: "2025-10-17",
          fiscalPeriod: "Q1 2026",
          form: "10-K",
        },
      ]);
    });

    it("drops a value reported only under a different unit key or taxonomy", async () => {
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              // Right concept, wrong unit key → not a USD revenue.
              Revenues: concept("EUR", [
                {
                  end: "2026-03-28",
                  val: 100_000_000_000,
                  fy: 2026,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
              // EPS lives under "USD/shares"; a plain "USD" print is not it.
              EarningsPerShareDiluted: concept("USD", [
                {
                  end: "2026-03-28",
                  val: 7.46,
                  fy: 2026,
                  fp: "FY",
                  form: "10-K",
                },
              ]),
              // Shares outstanding is a dei concept; the same name under
              // us-gaap must be ignored.
              EntityCommonStockSharesOutstanding: concept("shares", [
                { end: "2026-03-28", val: 14_000_000_000, form: "10-Q" },
              ]),
              ...ASSETS_ONLY,
            },
            // dei exists but lacks the concept → nothing to read.
            dei: {},
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics.map((m) => m.label)).toEqual(["Total assets"]);
      expect(facts.metrics[0].value).toBe(344_085_000_000);
    });
  });

  // ── fundamentals: entry hygiene + the empty-metrics throw ────────────────

  describe("fundamentals — entry hygiene and the no-metrics throw", () => {
    it("filters entries missing end, missing form, or with a non-finite val", async () => {
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              Assets: concept("USD", [
                // no `end` → cannot be ordered → dropped
                { val: 900_000_000_000, form: "10-K" },
                // no `form` → provenance unknown → dropped
                { end: "2026-05-01", val: 800_000_000_000 },
                // val null / a string → not finite → dropped
                { end: "2026-04-01", val: null, form: "10-Q" },
                { end: "2026-03-01", val: "700000000000", form: "10-Q" },
                // the only survivor, despite the earliest end date
                { end: "2026-01-31", val: 331_000_000_000, form: "10-Q" },
              ]),
            },
          }),
        ],
      ]);

      const facts = await new SecProvider().getCompanyFacts("AAPL");
      expect(facts.metrics).toHaveLength(1);
      expect(facts.metrics[0].value).toBe(331_000_000_000);
      expect(facts.metrics[0].end).toBe("2026-01-31");
    });

    it("throws when every entry is filtered out", async () => {
      stubFetch([
        [
          "companyfacts",
          factsBody({
            "us-gaap": {
              Assets: concept("USD", [{ end: "2026-01-31", val: null }]),
            },
          }),
        ],
      ]);

      await expect(new SecProvider().getCompanyFacts("AAPL")).rejects.toThrow(
        /no headline metrics found/,
      );
    });

    it("throws when the payload carries no facts block at all", async () => {
      stubFetch([["companyfacts", { cik: 320193, entityName: "Apple Inc." }]]);
      await expect(new SecProvider().getCompanyFacts("AAPL")).rejects.toThrow(
        /no headline metrics found/,
      );
    });

    it("serves the last good facts when a later refresh yields no metrics", async () => {
      // The throw is what makes the TtlCache fall back: a stale-but-real figure
      // beats an error card on a fundamentals frame.
      vi.useFakeTimers();
      let call = 0;
      const mock = vi.fn(async () => {
        call++;
        return jsonResponse(
          call === 1
            ? factsBody({ "us-gaap": ASSETS_ONLY })
            : factsBody({ "us-gaap": {} }),
        );
      });
      vi.stubGlobal("fetch", mock);

      const provider = new SecProvider();
      const first = await provider.getCompanyFacts("AAPL");
      expect(first.metrics[0].value).toBe(344_085_000_000);

      // Past the 15-minute TTL → a refresh runs, and it throws.
      vi.advanceTimersByTime(15 * 60_000 + 1);
      const stale = await provider.getCompanyFacts("AAPL");
      expect(stale.metrics[0].value).toBe(344_085_000_000);
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("serves a cached value inside the TTL without re-fetching", async () => {
      const mock = stubFetch([
        ["companyfacts", factsBody({ "us-gaap": ASSETS_ONLY })],
      ]);
      const provider = new SecProvider();
      const first = await provider.getCompanyFacts("AAPL");
      const second = await provider.getCompanyFacts("AAPL");
      expect(second).toEqual(first);
      expect(mock).toHaveBeenCalledTimes(1);
    });
  });

  // ── filings: the submissions parallel-array zip ───────────────────────────

  describe("filings — submissions parallel-array zip", () => {
    it("zips the recent arrays, skips incomplete rows, and omits falsy optional keys", async () => {
      stubFetch([
        [
          "submissions",
          {
            cik: "320193",
            name: "Apple Inc.",
            tickers: ["AAPL"],
            exchanges: ["Nasdaq"],
            sic: "3571",
            sicDescription: "Electronic Computers",
            category: "Large accelerated filer",
            fiscalYearEnd: "0926",
            filings: {
              recent: {
                accessionNumber: [
                  "0000320193-25-000073",
                  "0001140361-26-025622",
                  "", // no accession → skipped
                  "0000320193-26-000004", // blank form → skipped
                  "0000320193-26-000005", // filingDate array ends before it → skipped
                ],
                form: ["10-K", "8-K", "8-K", "", "8-K"],
                filingDate: [
                  "2025-10-31",
                  "2026-02-03",
                  "2026-03-01",
                  "2026-04-01",
                ],
                reportDate: ["2025-09-27", "", "2026-02-28", "2026-03-31"],
                primaryDocument: ["aapl-20250927.htm", "", "", "", ""],
                primaryDocDescription: ["10-K", "", "", "", ""],
                items: ["", "5.02,9.01", "", "", ""],
              },
            },
          },
        ],
      ]);

      const out = await new SecProvider().getCompanyFilings("AAPL");
      expect(out.cik).toBe("0000320193");
      expect(out.name).toBe("Apple Inc.");
      expect(out.tickers).toEqual(["AAPL"]);
      expect(out.exchanges).toEqual(["Nasdaq"]);
      expect(out.sic).toBe("3571");
      expect(out.sicDescription).toBe("Electronic Computers");
      expect(out.category).toBe("Large accelerated filer");
      expect(out.fiscalYearEnd).toBe("0926");

      // Three of the five accession slots were unusable.
      expect(out.filings).toEqual([
        {
          form: "10-K",
          filingDate: "2025-10-31",
          accessionNumber: "0000320193-25-000073",
          // Archives path: CIK without leading zeros, accession without dashes.
          url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000073/aapl-20250927.htm",
          reportDate: "2025-09-27",
          description: "10-K",
        },
        {
          form: "8-K",
          filingDate: "2026-02-03",
          accessionNumber: "0001140361-26-025622",
          // No primaryDocument → the filing's directory, with a trailing slash.
          url: "https://www.sec.gov/Archives/edgar/data/320193/000114036126025622/",
          items: "5.02,9.01",
        },
      ]);
      // toEqual treats an undefined-valued key as absent, so pin the keys too:
      // falsy optionals are omitted entirely, never written as "".
      expect(Object.keys(out.filings[0]).sort()).toEqual([
        "accessionNumber",
        "description",
        "filingDate",
        "form",
        "reportDate",
        "url",
      ]);
      expect(Object.keys(out.filings[1]).sort()).toEqual([
        "accessionNumber",
        "filingDate",
        "form",
        "items",
        "url",
      ]);
    });

    it("strips leading zeros from the CIK in the Archives path", async () => {
      // A short CIK is where the strip is visible: 0000001800 → /data/1800/.
      const mock = stubFetch([
        [
          "submissions",
          {
            cik: "1800",
            filings: {
              recent: {
                accessionNumber: ["0000001800-26-000010"],
                form: ["10-Q"],
                filingDate: ["2026-05-01"],
              },
            },
          },
        ],
      ]);

      // A raw CIK resolves end-to-end, no ticker map involved.
      const out = await new SecProvider().getCompanyFilings("1800");
      expect(fetchTarget(mock)).toBe(
        "https://data.sec.gov/submissions/CIK0000001800.json",
      );
      expect(out.cik).toBe("0000001800");
      expect(out.filings[0].url).toBe(
        "https://www.sec.gov/Archives/edgar/data/1800/000000180026000010/",
      );
    });

    it("defaults the profile fields and omits absent optionals", async () => {
      stubFetch([["submissions", EMPTY_SUBMISSIONS]]);
      const out = await new SecProvider().getCompanyFilings("AAPL");
      expect(out.name).toBe("");
      expect(out.tickers).toEqual([]);
      expect(out.exchanges).toEqual([]);
      expect(out.filings).toEqual([]);
      expect(Object.keys(out).sort()).toEqual([
        "cik",
        "exchanges",
        "filings",
        "name",
        "tickers",
      ]);
    });

    it("falls back to the resolved CIK when the body omits one", async () => {
      stubFetch([
        [
          "submissions",
          { filings: { recent: { accessionNumber: [], form: [] } } },
        ],
      ]);
      const out = await new SecProvider().getCompanyFilings("AAPL");
      expect(out.cik).toBe("0000320193");
    });

    it("throws when the recent-filings block is missing or not an array", async () => {
      // A failed load is never written to the cache, so the same provider can be
      // pointed at a second bad shape without a stale hit masking the throw.
      const provider = new SecProvider();
      stubFetch([["submissions", { cik: "320193", name: "Apple Inc." }]]);
      await expect(provider.getCompanyFilings("AAPL")).rejects.toThrow(
        /unexpected response shape/,
      );

      stubFetch([
        ["submissions", { filings: { recent: { accessionNumber: {} } } }],
      ]);
      await expect(provider.getCompanyFilings("AAPL")).rejects.toThrow(
        /unexpected response shape/,
      );
    });
  });

  // ── transport: proxy split + contact User-Agent ───────────────────────────

  describe("transport — proxy split and contact User-Agent", () => {
    it("proxies companyfacts but fetches submissions direct in the browser", async () => {
      // The split must not converge: companyfacts sends no CORS header, so the
      // browser has to go through the same-origin runtime proxy, while
      // submissions is CORS-safe and must stay direct.
      vi.stubGlobal("document", {} as Document);
      const mock = stubFetch([
        ["companyfacts", factsBody({ "us-gaap": ASSETS_ONLY })],
        ["submissions", EMPTY_SUBMISSIONS],
      ]);

      const provider = new SecProvider();
      await provider.getCompanyFacts("AAPL");
      await provider.getCompanyFilings("AAPL");

      const factsTarget = fetchTarget(mock, 0);
      expect(factsTarget.startsWith(PROXY_PREFIX)).toBe(true);
      expect(factsTarget).toContain(
        encodeURIComponent(
          "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
        ),
      );
      expect(fetchTarget(mock, 1)).toBe(
        "https://data.sec.gov/submissions/CIK0000320193.json",
      );
    });

    it("sends the contact User-Agent on both endpoints in Node, direct", async () => {
      const mock = stubFetch([
        ["companyfacts", factsBody({ "us-gaap": ASSETS_ONLY })],
        ["submissions", EMPTY_SUBMISSIONS],
      ]);

      const provider = new SecProvider("a@b.com");
      await provider.getCompanyFacts("AAPL");
      await provider.getCompanyFilings("AAPL");

      expect(fetchUa(mock, 0)).toBe("zframes (a@b.com)");
      expect(fetchUa(mock, 1)).toBe("zframes (a@b.com)");
      // proxied:true is a no-op in Node — no CORS there.
      expect(fetchTarget(mock, 0)).toBe(
        "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
      );
    });

    it("leaves the shared Node User-Agent alone when no contact is given", async () => {
      const mock = stubFetch([
        ["companyfacts", factsBody({ "us-gaap": ASSETS_ONLY })],
      ]);
      await new SecProvider().getCompanyFacts("AAPL");
      // No per-provider override: the data-primitives default UA goes out.
      expect(fetchUa(mock)).toBe(NODE_DEFAULT_UA);
    });

    it("does not set a User-Agent in the browser even with a contact", async () => {
      // Browsers forbid setting User-Agent, so nodeInit() must stay silent
      // there — the proxy sends its own.
      vi.stubGlobal("document", {} as Document);
      const mock = stubFetch([
        ["companyfacts", factsBody({ "us-gaap": ASSETS_ONLY })],
      ]);
      await new SecProvider("a@b.com").getCompanyFacts("AAPL");
      expect(fetchUa(mock)).toBeNull();
    });
  });
});
