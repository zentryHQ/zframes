import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BitcoinDataProvider as BitcoinDataProviderType } from "./index";

/**
 * What this file pins: the two things that decide whether three cycle-oscillator
 * frames show a number or a blank card.
 *
 * 1. **The all-failed → throw branch.** bitcoin-data.com's free tier is capped at
 *    10 requests/hour and the snapshot is cached for 18h, so a refresh that comes
 *    back empty must *throw* — that is the only thing that makes the TtlCache
 *    serve its last good value. If it ever returned a triple-empty snapshot
 *    instead, that emptiness would be cached for 18 hours and SOPR / Puell /
 *    Reserve Risk would all go blank for most of a day. Pinned from every angle:
 *    all three rejecting, all three 429ing, and all three arriving fulfilled but
 *    unusable (empty array, non-array body, garbage rows) — plus the payoff, that
 *    a later dead refresh serves the previous snapshot rather than emptiness.
 *    Partial failure is *routine* at that rate cap, so the one-of-three case must
 *    still resolve (with `null` headlines and empty histories for the losers).
 *
 * 2. **`seriesFrom`'s positional "first finite field" heuristic.** The metric's
 *    field name differs per endpoint (sopr / puellMultiple / reserveRisk), so the
 *    value is read as the first key that isn't `d`/`unixTs` and parses finite —
 *    deliberately, so a slug rename can't break us. The cost is order-sensitivity:
 *    a numeric column ahead of the metric would silently be plotted *as* the
 *    metric. Both directions are pinned here so that trade-off is visible, along
 *    with the seconds→ms `unixTs` scaling, its `Date.parse(d)` fallback, the row
 *    guards, the ascending sort, the 365-point tail, and `date` being the newest
 *    of the three series (a lagging metric must not backdate the card).
 *
 * Two KNOWN BUGs are pinned below: `Number(null)` is 0, which slips past both
 * `Number.isFinite` guards, so a null metric plots as 0 and a null `unixTs` stamps
 * the row to the epoch instead of falling back to `d`.
 *
 * The cache here is an *instance* field, not a module-level singleton, so a fresh
 * provider means a fresh cache. We still take a fresh module per test (house
 * pattern) so nothing can leak between tests, and construct one provider per test
 * unless the test is specifically about cache sharing.
 */
type Ctor = typeof BitcoinDataProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.BitcoinDataProvider;
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const BASE = "https://bitcoin-data.com/v1";
const URL_SOPR = `${BASE}/sopr`;
const URL_PUELL = `${BASE}/puell-multiple`;
const URL_RR = `${BASE}/reserve-risk`;

const SLUGS = ["sopr", "puell-multiple", "reserve-risk"] as const;
type Slug = (typeof SLUGS)[number];

/** How one metric endpoint behaves in a test. */
type Outcome = { body: unknown } | { status: number } | { reject: string };
type Routes = Partial<Record<Slug, Outcome>>;

/**
 * Route each metric endpoint independently off its trailing slug. Any slug NOT
 * in `routes` answers 429 — partial failure is the normal case on a 10-req/hour
 * tier, so tests supply only the metrics they care about and let the rest
 * throttle.
 */
function routedFetch(routes: Routes) {
  return vi.fn().mockImplementation((url: string) => {
    const slug = new URL(String(url)).pathname.replace("/v1/", "") as Slug;
    const outcome: Outcome = routes[slug] ?? { status: 429 };
    if ("reject" in outcome) return Promise.reject(new Error(outcome.reject));
    if ("status" in outcome)
      return Promise.resolve(jsonResponse(null, outcome.status));
    return Promise.resolve(jsonResponse(outcome.body));
  });
}

const DAY_MS = 86_400_000;
const T = (d: string) => Date.parse(d);
const secs = (d: string) => Date.parse(d) / 1000;

/**
 * The real row shapes: `{ d, unixTs: <seconds>, <metricSlug> }`, with the metric
 * value arriving as a string on some endpoints and a number on others.
 */
const soprRow = (d: string, sopr: string | number | null) => ({
  d,
  unixTs: secs(d),
  sopr,
});
const puellRow = (d: string, puellMultiple: number) => ({
  d,
  unixTs: secs(d),
  puellMultiple,
});
const rrRow = (d: string, reserveRisk: number) => ({
  d,
  unixTs: secs(d),
  reserveRisk,
});

const SOPR_ROWS = [
  soprRow("2024-01-01", "0.98"),
  soprRow("2024-01-02", "1.02"),
  soprRow("2024-01-03", "1.11"),
];
const PUELL_ROWS = [
  puellRow("2024-01-01", 0.9),
  puellRow("2024-01-02", 1.4),
  puellRow("2024-01-03", 1.55),
];
const RR_ROWS = [
  rrRow("2024-01-01", 0.0021),
  rrRow("2024-01-02", 0.0024),
  rrRow("2024-01-03", 0.0026),
];

const goodRoutes = (): Routes => ({
  sopr: { body: SOPR_ROWS },
  "puell-multiple": { body: PUELL_ROWS },
  "reserve-risk": { body: RR_ROWS },
});

/** `n` consecutive daily sopr rows starting at `start`, value 1 + i/1000. */
function dailySoprSeries(start: string, n: number) {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, i) => ({
    d: new Date(t0 + i * DAY_MS).toISOString().slice(0, 10),
    unixTs: (t0 + i * DAY_MS) / 1000,
    sopr: 1 + i / 1000,
  }));
}

describe("BitcoinDataProvider", () => {
  let BitcoinDataProvider: Ctor;

  beforeEach(async () => {
    BitcoinDataProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Resolve one refresh over `routes`, returning the result and the fetch mock. */
  async function extrasOf(routes: Routes) {
    const fetchMock = routedFetch(routes);
    vi.stubGlobal("fetch", fetchMock);
    const extras = await new BitcoinDataProvider().getOnchainExtras();
    return { extras, fetchMock };
  }

  it("advertises its identity and capabilities", () => {
    const provider = new BitcoinDataProvider();
    expect(provider.name).toBe("bitcoin-data");
    expect(provider.capabilities).toEqual(["onchain-cycle-extras"]);
  });

  describe("one refresh, three requests", () => {
    it("fetches exactly the three metric endpoints, and none again inside the 18h TTL", async () => {
      const fetchMock = routedFetch(goodRoutes());
      vi.stubGlobal("fetch", fetchMock);

      const provider = new BitcoinDataProvider();
      const first = await provider.getOnchainExtras();
      const second = await provider.getOnchainExtras();

      // Three requests total — one refresh, not one per metric per caller.
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        URL_SOPR,
        URL_PUELL,
        URL_RR,
      ]);
      // The second read is the cached object itself, no new request.
      expect(second).toBe(first);

      // The cache is an INSTANCE field, so a second provider pays the three
      // requests again — hosts must share one provider, not construct per frame.
      const other = await new BitcoinDataProvider().getOnchainExtras();
      expect(other).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it("coalesces concurrent callers onto a single refresh", async () => {
      const fetchMock = routedFetch(goodRoutes());
      vi.stubGlobal("fetch", fetchMock);

      const provider = new BitcoinDataProvider();
      const [a, b] = await Promise.all([
        provider.getOnchainExtras(),
        provider.getOnchainExtras(),
      ]);

      expect(b).toBe(a);
      expect(a.sopr).toBe(1.11);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("row parsing", () => {
    it("reads each endpoint's own metric slug and its whole daily tail", async () => {
      const { extras } = await extrasOf(goodRoutes());

      expect(extras.history.sopr).toEqual([
        { time: T("2024-01-01"), value: 0.98 },
        { time: T("2024-01-02"), value: 1.02 },
        { time: T("2024-01-03"), value: 1.11 },
      ]);
      expect(extras.history.puell).toEqual([
        { time: T("2024-01-01"), value: 0.9 },
        { time: T("2024-01-02"), value: 1.4 },
        { time: T("2024-01-03"), value: 1.55 },
      ]);
      expect(extras.history.reserveRisk).toEqual([
        { time: T("2024-01-01"), value: 0.0021 },
        { time: T("2024-01-02"), value: 0.0024 },
        { time: T("2024-01-03"), value: 0.0026 },
      ]);
      // Headlines are the newest point of each series.
      expect(extras.sopr).toBe(1.11);
      expect(extras.puell).toBe(1.55);
      expect(extras.reserveRisk).toBe(0.0026);
      expect(extras.date).toBe("2024-01-03");
    });

    it("skips a non-numeric field that precedes the metric instead of choosing it", async () => {
      const { extras } = await extrasOf({
        sopr: {
          body: [
            {
              d: "2024-01-02",
              unixTs: secs("2024-01-02"),
              status: "n/a",
              sopr: "1.02",
            },
          ],
        },
      });

      expect(extras.history.sopr).toEqual([
        { time: T("2024-01-02"), value: 1.02 },
      ]);
      expect(extras.sopr).toBe(1.02);
    });

    it("stops at the FIRST finite field, so a numeric column ahead of the metric hijacks the series", async () => {
      // The positional heuristic is deliberate (a slug rename can't break it) but
      // order-sensitive. Pinned in both directions: a numeric column BEFORE the
      // metric wins, a numeric column AFTER it is ignored.
      const { extras } = await extrasOf({
        sopr: {
          body: [
            {
              d: "2024-01-02",
              unixTs: secs("2024-01-02"),
              blockHeight: 825_000,
              sopr: "1.02",
            },
          ],
        },
        "puell-multiple": {
          body: [
            {
              d: "2024-01-02",
              unixTs: secs("2024-01-02"),
              puellMultiple: 1.4,
              btcPrice: 42_000,
            },
          ],
        },
      });

      // Not 1.02 — the block height is plotted as SOPR.
      expect(extras.sopr).toBe(825_000);
      expect(extras.puell).toBe(1.4);
    });

    it("treats unixTs as seconds (x1000), as a number or a string, over `d`", async () => {
      const { extras } = await extrasOf({
        // `d` deliberately disagrees with unixTs: unixTs wins when it parses.
        sopr: {
          body: [{ d: "1970-01-01", unixTs: 1_700_000_000, sopr: "1.02" }],
        },
        "puell-multiple": {
          body: [{ d: "1970-01-01", unixTs: "1700086400", puellMultiple: 1.4 }],
        },
      });

      expect(extras.history.sopr).toEqual([
        { time: 1_700_000_000_000, value: 1.02 },
      ]);
      expect(extras.history.puell).toEqual([
        { time: 1_700_086_400_000, value: 1.4 },
      ]);
      expect(extras.date).toBe("2023-11-15");
    });

    it("falls back to Date.parse(d) when unixTs is absent", async () => {
      const { extras } = await extrasOf({
        sopr: {
          body: [
            { d: "2024-01-02", sopr: "1.02" },
            { d: "2024-01-01", sopr: "0.98" },
          ],
        },
      });

      expect(extras.history.sopr).toEqual([
        { time: T("2024-01-01"), value: 0.98 },
        { time: T("2024-01-02"), value: 1.02 },
      ]);
      expect(extras.date).toBe("2024-01-02");
    });

    it("drops non-object rows and rows without a finite value or a finite time", async () => {
      const { extras } = await extrasOf({
        sopr: {
          body: [
            null,
            undefined,
            "2024-01-02",
            42,
            // no metric field at all → no finite value
            { d: "2024-01-02", unixTs: secs("2024-01-02") },
            // non-numeric metric
            { d: "2024-01-02", unixTs: secs("2024-01-02"), sopr: "n/a" },
            // unparseable `d` and no unixTs → no finite time
            { d: "not-a-date", sopr: "1.50" },
            // unixTs garbage → falls back to `d`, so this row survives
            { d: "2024-01-02", unixTs: "n/a", sopr: "1.02" },
            soprRow("2024-01-01", "0.98"),
          ],
        },
      });

      expect(extras.history.sopr).toEqual([
        { time: T("2024-01-01"), value: 0.98 },
        { time: T("2024-01-02"), value: 1.02 },
      ]);
      expect(extras.sopr).toBe(1.02);
    });

    it("keeps a row whose metric is null, reading it as 0", async () => {
      const { extras } = await extrasOf({
        sopr: {
          body: [soprRow("2024-01-01", "1.02"), soprRow("2024-01-02", null)],
        },
      });

      // KNOWN BUG: `Number(null)` is 0, which passes the Number.isFinite guard, so
      // a row whose metric is null is plotted as 0 and becomes the headline —
      // should be dropped like any other row without a finite value. Pinned so the
      // suite stays green; fixing the source must flip this assertion.
      expect(extras.history.sopr).toEqual([
        { time: T("2024-01-01"), value: 1.02 },
        { time: T("2024-01-02"), value: 0 },
      ]);
      expect(extras.sopr).toBe(0);
    });

    it("stamps a row whose unixTs is null to the epoch", async () => {
      const { extras } = await extrasOf({
        sopr: { body: [{ d: "2024-01-02", unixTs: null, sopr: "1.02" }] },
      });

      // KNOWN BUG: `Number(null)` is 0, so a null unixTs reads as a finite 0 and
      // the row is stamped to the epoch — should fall back to Date.parse(row.d)
      // like any other unusable unixTs. Pinned so the suite stays green; fixing
      // the source must flip this assertion.
      expect(extras.history.sopr).toEqual([{ time: 0, value: 1.02 }]);
      expect(extras.date).toBe("1970-01-01");
    });

    it("sorts a descending payload ascending and takes the headline from the newest row", async () => {
      const { extras } = await extrasOf({
        sopr: { body: [SOPR_ROWS[2], SOPR_ROWS[0], SOPR_ROWS[1]] },
      });

      expect(extras.history.sopr.map((p) => p.time)).toEqual([
        T("2024-01-01"),
        T("2024-01-02"),
        T("2024-01-03"),
      ]);
      expect(extras.sopr).toBe(1.11);
      expect(extras.date).toBe("2024-01-03");
    });

    it("keeps only the last 365 points of a long series, leaving a short one intact", async () => {
      const long = dailySoprSeries("2023-01-01", 400);
      const { extras } = await extrasOf({
        sopr: { body: long },
        "puell-multiple": { body: PUELL_ROWS },
      });

      // 400 daily points in, the most recent 365 out — the first 35 are dropped.
      expect(extras.history.sopr).toHaveLength(365);
      expect(extras.history.sopr[0]).toEqual({
        time: Date.parse("2023-01-01") + 35 * DAY_MS,
        value: 1 + 35 / 1000,
      });
      expect(extras.history.sopr.at(-1)).toEqual({
        time: Date.parse("2023-01-01") + 399 * DAY_MS,
        value: 1 + 399 / 1000,
      });
      expect(extras.sopr).toBe(1 + 399 / 1000);

      // A shorter series is untouched by the slice.
      expect(extras.history.puell).toHaveLength(3);
      expect(extras.history.puell.at(-1)).toEqual({
        time: T("2024-01-03"),
        value: 1.55,
      });
    });
  });

  describe("date", () => {
    it("dates the card from the newest of the three series, whichever metric that is", async () => {
      const { extras } = await extrasOf({
        sopr: { body: [soprRow("2024-01-05", "1.02")] },
        // Puell leads here — a lagging SOPR must not backdate the card.
        "puell-multiple": { body: [puellRow("2024-03-10", 1.4)] },
        "reserve-risk": { body: [rrRow("2024-02-01", 0.0024)] },
      });
      expect(extras.date).toBe("2024-03-10");

      const { extras: soprLeads } = await extrasOf({
        sopr: { body: [soprRow("2024-04-01", "1.02")] },
        "puell-multiple": { body: [puellRow("2024-03-10", 1.4)] },
        "reserve-risk": { body: [rrRow("2024-02-01", 0.0024)] },
      });
      expect(soprLeads.date).toBe("2024-04-01");
    });
  });

  describe("partial failure (routine on a 10-req/hour tier)", () => {
    it("resolves with the metric that came back and nulls the two that did not", async () => {
      const { extras } = await extrasOf({
        sopr: { body: SOPR_ROWS },
        "puell-multiple": { reject: "network down" },
        "reserve-risk": { status: 429 },
      });

      expect(extras.sopr).toBe(1.11);
      expect(extras.puell).toBeNull();
      expect(extras.reserveRisk).toBeNull();
      expect(extras.history.sopr).toHaveLength(3);
      expect(extras.history.puell).toEqual([]);
      expect(extras.history.reserveRisk).toEqual([]);
      // The surviving metric alone dates the card.
      expect(extras.date).toBe("2024-01-03");
    });
  });

  describe("total failure", () => {
    it("throws rather than resolving when all three requests reject", async () => {
      const fetchMock = routedFetch({
        sopr: { reject: "network" },
        "puell-multiple": { reject: "network" },
        "reserve-risk": { reject: "network" },
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        new BitcoinDataProvider().getOnchainExtras(),
      ).rejects.toThrow(/all metric fetches failed \(likely rate-limited\)/);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws when all three are rate-limited (429)", async () => {
      vi.stubGlobal("fetch", routedFetch({}));

      await expect(
        new BitcoinDataProvider().getOnchainExtras(),
      ).rejects.toThrow(/all metric fetches failed \(likely rate-limited\)/);
    });

    it("throws when all three arrive fulfilled but unusable", async () => {
      // Emptiness is judged on the parsed series, not on the settle status: an
      // empty array, a non-array error body and rows that all fail the guards are
      // just as fatal as a rejection — otherwise a triple-empty snapshot would be
      // cached for 18h.
      vi.stubGlobal(
        "fetch",
        routedFetch({
          sopr: { body: [] },
          "puell-multiple": { body: { error: "rate limited" } },
          "reserve-risk": { body: [null, { d: "nope", reserveRisk: "n/a" }] },
        }),
      );

      await expect(
        new BitcoinDataProvider().getOnchainExtras(),
      ).rejects.toThrow(/all metric fetches failed \(likely rate-limited\)/);
    });

    it("serves the last good snapshot on a later dead refresh, never an empty card", async () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal("fetch", routedFetch(goodRoutes()));
        const provider = new BitcoinDataProvider();
        const good = await provider.getOnchainExtras();
        expect(good.sopr).toBe(1.11);

        // Let the 18h TTL lapse, then make every metric 429.
        vi.advanceTimersByTime(19 * 60 * 60_000);
        const failing = routedFetch({});
        vi.stubGlobal("fetch", failing);

        const stale = await provider.getOnchainExtras();

        // The throw is what buys this: stale-on-error hands back the previous
        // snapshot instead of three blank oscillators.
        expect(stale).toEqual(good);
        expect(stale.history.sopr).toHaveLength(3);
        expect(stale.sopr).toBe(1.11);
        // …and it really did retry (all three, then fell back).
        expect(failing).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
