import { afterEach, describe, expect, it, vi } from "vitest";
import { UltrasoundProvider } from "./index";

// What this file pins: every number on the ETH-supply card is a *scaled
// derivation* of a raw ultrasound.money fraction, and the scale factor is
// invisible in the output — 0.03% and 3% are both plausible-looking staking
// APRs, so a lost or doubled ×100 ships silently. Specifically:
//
//  - The fraction→percent conversions done exactly ONCE:
//    `supply_growth_rate_yearly` / `_pow` × 100, and
//    `stakingAprPct = (issuance.apr + mev.apr + tips.apr) * 100` — a THREE-term
//    sum scaled once. Dropping a term understates the yield; scaling each term
//    and then the sum again reads as a ~300% APR.
//  - `num()`'s coercion of missing / non-finite / null inputs to 0, so an
//    absent `mev.apr` contributes 0 instead of NaN-poisoning the whole APR (and
//    a sparse `d1` renders 0 ETH/yr rather than NaN).
//  - The required-vs-optional split across the four endpoints, which is the
//    difference between a degraded card and a blank one: `gauge-rates` is
//    REQUIRED (a rejected fetch, or a 200 with no `d1`, throws so the cache
//    serves the last good reading), while `validator-rewards`, `burn-rates` and
//    `supply-over-time` each fail INDEPENDENTLY and degrade to 0 / an empty
//    history while still returning a usable object.
//  - The supply-window fallback chain d30 → d7 → d1 → [], in exactly that
//    order, and the history mapping `{supply, timestamp}` →
//    `{time: Date.parse(timestamp), value: supply}` with non-finite entries
//    dropped. The headline `supply` is the LAST surviving history point, so the
//    big number and the sparkline's right edge can never disagree.
//  - The one-poll fan-out: a single `getEthSupply()` issues exactly four
//    parallel requests, and a second call inside the 2-minute TTL issues none.
//
// Unlike most providers here the cache is a *private instance* field, not a
// module-level singleton, so a fresh `new UltrasoundProvider()` per test is
// genuinely isolated — no `vi.resetModules()` needed. (`persist: true` is a
// no-op under the Node test environment, which has no `localStorage`, so
// nothing leaks between tests through storage either.)

const BASE = "https://ultrasound.money/api/v2/fees";

/** A minimal Response-like the shared fetchJson understands. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Route by URL fragment. Anything unrouted answers 500, so an endpoint a test
 * deliberately omits arrives as a REJECTED settled result — exactly how a
 * partial ultrasound.money outage reaches the provider. A route whose body is
 * an `Error` rejects the fetch itself (transport failure, no status at all).
 */
function routedFetch(routes: Array<[string, unknown]>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [fragment, body] of routes) {
      if (url.includes(fragment)) {
        return body instanceof Error
          ? Promise.reject(body)
          : Promise.resolve(jsonResponse(body));
      }
    }
    return Promise.resolve(jsonResponse(null, 500));
  });
}

/** GET /gauge-rates — the REQUIRED headline burn/issuance/net-growth picture. */
function gaugeBody() {
  return {
    d1: {
      burn_rate_yearly: { eth: 812_345 },
      issuance_rate_yearly: { eth: 690_120 },
      // Fractions upstream: -0.12% net growth, +0.33% counterfactual PoW.
      supply_growth_rate_yearly: -0.0012,
      supply_growth_rate_yearly_pow: 0.0033,
    },
  };
}

/** GET /validator-rewards — three APR fractions that must be SUMMED. */
function rewardsBody() {
  return {
    issuance: { apr: 0.02 },
    mev: { apr: 0.005 },
    tips: { apr: 0.001 },
  };
}

/** GET /burn-rates */
function burnBody() {
  return { d1: { rate: { eth_per_minute: 1.42 } } };
}

/** Three 30-day supply points, oldest→newest. */
const D30_POINTS = [
  { supply: 120_400_000, timestamp: "2026-06-26T00:00:00Z" },
  { supply: 120_380_000, timestamp: "2026-07-11T00:00:00Z" },
  { supply: 120_355_500, timestamp: "2026-07-26T00:00:00Z" },
];
const D30_TIMES = [1_782_432_000_000, 1_783_728_000_000, 1_785_024_000_000];

/** GET /supply-over-time */
function supplyBody() {
  return { d30: D30_POINTS };
}

/** All four endpoints healthy. */
function allHealthy() {
  return routedFetch([
    ["/gauge-rates", gaugeBody()],
    ["/validator-rewards", rewardsBody()],
    ["/burn-rates", burnBody()],
    ["/supply-over-time", supplyBody()],
  ]);
}

describe("UltrasoundProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new UltrasoundProvider();
    expect(provider.name).toBe("ultrasound.money");
    expect([...provider.capabilities]).toEqual(["eth-supply"]);
  });

  describe("getEthSupply", () => {
    it("maps all four endpoints into one EthSupply, scaling once", async () => {
      const fetchMock = allHealthy();
      vi.stubGlobal("fetch", fetchMock);

      const out = await new UltrasoundProvider().getEthSupply();

      expect(out).toEqual({
        // Headline supply is the newest history point, not a separate field.
        supply: 120_355_500,
        burnRateYearlyEth: 812_345,
        issuanceRateYearlyEth: 690_120,
        // ×100 exactly once: the fraction -0.0012 is -0.12 percent.
        supplyGrowthYearlyPct: -0.12,
        supplyGrowthYearlyPowPct: 0.33,
        // (0.02 + 0.005 + 0.001) × 100
        stakingAprPct: 2.6,
        burnEthPerMin: 1.42,
        history: [
          { time: D30_TIMES[0], value: 120_400_000 },
          { time: D30_TIMES[1], value: 120_380_000 },
          { time: D30_TIMES[2], value: 120_355_500 },
        ],
      });
      // The raw fraction (-0.0012) and a double-scaled figure (-12) are both
      // readable as "a percent" on the card — neither is what we render.
      expect(out.supplyGrowthYearlyPct).not.toBe(-0.0012);
      expect(out.supplyGrowthYearlyPct).not.toBe(-12);
      // Timestamps are ISO strings, so a mis-parse lands the sparkline in 1970.
      expect(new Date(out.history[2].time).getUTCFullYear()).toBe(2026);

      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        `${BASE}/gauge-rates`,
        `${BASE}/validator-rewards`,
        `${BASE}/burn-rates`,
        `${BASE}/supply-over-time`,
      ]);
    });

    it("issues all four endpoints before any response lands", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const routed = allHealthy();
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        await gate;
        return routed(url);
      });
      vi.stubGlobal("fetch", fetchMock);

      // Deliberately not awaited: with a sequential `await` per endpoint only
      // the first request would be in flight while the gate is closed.
      const pending = new UltrasoundProvider().getEthSupply();
      expect(fetchMock).toHaveBeenCalledTimes(4);

      release();
      const out = await pending;
      expect(out.burnEthPerMin).toBe(1.42);
      expect(out.stakingAprPct).toBe(2.6);
    });

    it("sums the three APR components and scales the sum once", async () => {
      vi.stubGlobal("fetch", allHealthy());

      const out = await new UltrasoundProvider().getEthSupply();

      // Each component scaled on its own: 2 + 0.5 + 0.1. Dropping any term
      // would land on 2.1 / 2.5 / 2.6-0.1, all plausible-looking APRs.
      expect(out.stakingAprPct).toBe(2 + 0.5 + 0.1);
      expect(out.stakingAprPct).toBe(2.6);
      // Not the unscaled sum, and not a per-term-then-total double scaling.
      expect(out.stakingAprPct).not.toBe(0.026);
      expect(out.stakingAprPct).not.toBe(260);
    });

    it("contributes 0 for an absent APR component, never NaN", async () => {
      const { mev: _dropped, ...noMev } = rewardsBody();
      vi.stubGlobal(
        "fetch",
        routedFetch([
          ["/gauge-rates", gaugeBody()],
          ["/validator-rewards", noMev],
          ["/burn-rates", burnBody()],
          ["/supply-over-time", supplyBody()],
        ]),
      );

      const out = await new UltrasoundProvider().getEthSupply();

      // (0.02 + 0 + 0.001) × 100 — a bare `+` on undefined would be NaN and
      // blank out the whole APR readout.
      expect(out.stakingAprPct).toBe(2.1);
      expect(Number.isFinite(out.stakingAprPct)).toBe(true);
    });

    it("coerces non-finite and null APR components to 0", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          ["/gauge-rates", gaugeBody()],
          [
            "/validator-rewards",
            {
              issuance: { apr: 0.02 },
              mev: { apr: "n/a" }, // Number("n/a") → NaN → 0
              tips: { apr: null }, // Number(null) → 0
            },
          ],
          ["/burn-rates", burnBody()],
          ["/supply-over-time", supplyBody()],
        ]),
      );

      const out = await new UltrasoundProvider().getEthSupply();
      expect(out.stakingAprPct).toBe(2);
    });

    it("defaults a sparse d1 to 0 rather than NaN", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          // `d1` exists (so the required guard passes) but carries nothing.
          ["/gauge-rates", { d1: {} }],
          ["/validator-rewards", rewardsBody()],
          ["/burn-rates", burnBody()],
          ["/supply-over-time", supplyBody()],
        ]),
      );

      const out = await new UltrasoundProvider().getEthSupply();
      expect(out.burnRateYearlyEth).toBe(0);
      expect(out.issuanceRateYearlyEth).toBe(0);
      expect(out.supplyGrowthYearlyPct).toBe(0);
      expect(out.supplyGrowthYearlyPowPct).toBe(0);
      // The rest of the card still renders.
      expect(out.stakingAprPct).toBe(2.6);
      expect(out.supply).toBe(120_355_500);
    });

    describe("gauge-rates is required", () => {
      it("throws when the gauge-rates fetch rejects outright", async () => {
        const fetchMock = routedFetch([
          ["/gauge-rates", new Error("ECONNRESET")],
          ["/validator-rewards", rewardsBody()],
          ["/burn-rates", burnBody()],
          ["/supply-over-time", supplyBody()],
        ]);
        vi.stubGlobal("fetch", fetchMock);

        await expect(new UltrasoundProvider().getEthSupply()).rejects.toThrow(
          /gauge-rates: unavailable/,
        );
        // The other three were still attempted (one settled fan-out, not a
        // short-circuit) — only the verdict is fatal.
        expect(fetchMock).toHaveBeenCalledTimes(4);
      });

      it("throws when gauge-rates answers 200 without a d1 window", async () => {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", { d7: gaugeBody().d1 }],
            ["/validator-rewards", rewardsBody()],
            ["/burn-rates", burnBody()],
            ["/supply-over-time", supplyBody()],
          ]),
        );

        await expect(new UltrasoundProvider().getEthSupply()).rejects.toThrow(
          "ultrasound gauge-rates: unavailable",
        );
      });

      it("serves the last good reading when gauge-rates later fails", async () => {
        vi.useFakeTimers();
        try {
          const fetchMock = allHealthy();
          vi.stubGlobal("fetch", fetchMock);
          const provider = new UltrasoundProvider();
          const good = await provider.getEthSupply();

          // Let the 2-minute TTL lapse, then break the required endpoint.
          vi.advanceTimersByTime(3 * 60_000);
          const brokenGauge = routedFetch([
            ["/validator-rewards", rewardsBody()],
            ["/burn-rates", burnBody()],
            ["/supply-over-time", supplyBody()],
          ]);
          vi.stubGlobal("fetch", brokenGauge);

          // Stale-on-error: the card keeps the minutes-old figures instead of
          // surfacing the throw…
          await expect(provider.getEthSupply()).resolves.toEqual(good);
          // …and it genuinely retried rather than short-circuiting to the memo.
          expect(brokenGauge).toHaveBeenCalledTimes(4);
        } finally {
          vi.useRealTimers();
        }
      });
    });

    describe("the other three endpoints degrade independently", () => {
      it("reports a 0 staking APR when validator-rewards fails", async () => {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", gaugeBody()],
            ["/burn-rates", burnBody()],
            ["/supply-over-time", supplyBody()],
          ]),
        );

        const out = await new UltrasoundProvider().getEthSupply();
        expect(out.stakingAprPct).toBe(0);
        // Every other figure is untouched.
        expect(out.burnEthPerMin).toBe(1.42);
        expect(out.supplyGrowthYearlyPct).toBe(-0.12);
        expect(out.supply).toBe(120_355_500);
      });

      it("reports a 0 per-minute burn when burn-rates fails", async () => {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", gaugeBody()],
            ["/validator-rewards", rewardsBody()],
            ["/supply-over-time", supplyBody()],
          ]),
        );

        const out = await new UltrasoundProvider().getEthSupply();
        expect(out.burnEthPerMin).toBe(0);
        expect(out.stakingAprPct).toBe(2.6);
        expect(out.burnRateYearlyEth).toBe(812_345);
        expect(out.history).toHaveLength(3);
      });

      it("reports an empty history and 0 supply when supply-over-time fails", async () => {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", gaugeBody()],
            ["/validator-rewards", rewardsBody()],
            ["/burn-rates", burnBody()],
          ]),
        );

        const out = await new UltrasoundProvider().getEthSupply();
        expect(out.history).toEqual([]);
        expect(out.supply).toBe(0);
        expect(out.stakingAprPct).toBe(2.6);
        expect(out.burnEthPerMin).toBe(1.42);
      });

      it("still returns a usable object when all three optionals fail", async () => {
        vi.stubGlobal("fetch", routedFetch([["/gauge-rates", gaugeBody()]]));

        const out = await new UltrasoundProvider().getEthSupply();
        expect(out).toEqual({
          supply: 0,
          burnRateYearlyEth: 812_345,
          issuanceRateYearlyEth: 690_120,
          supplyGrowthYearlyPct: -0.12,
          supplyGrowthYearlyPowPct: 0.33,
          stakingAprPct: 0,
          burnEthPerMin: 0,
          history: [],
        });
      });
    });

    describe("supply-window fallback", () => {
      /** Distinct one-point windows so the winner is unambiguous. */
      const window30 = [
        { supply: 30_000_000, timestamp: "2026-07-26T00:00:00Z" },
      ];
      const window7 = [
        { supply: 7_000_000, timestamp: "2026-07-26T00:00:00Z" },
      ];
      const window1 = [
        { supply: 1_000_000, timestamp: "2026-07-26T00:00:00Z" },
      ];

      async function supplyFor(body: unknown) {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", gaugeBody()],
            ["/validator-rewards", rewardsBody()],
            ["/burn-rates", burnBody()],
            ["/supply-over-time", body],
          ]),
        );
        return new UltrasoundProvider().getEthSupply();
      }

      it("prefers d30 when all three windows are present", async () => {
        const out = await supplyFor({
          d30: window30,
          d7: window7,
          d1: window1,
        });
        expect(out.supply).toBe(30_000_000);
      });

      it("falls through d30 → d7 → d1 → [] in exactly that order", async () => {
        // d30 absent → d7 (d1 also present, and must lose).
        expect((await supplyFor({ d7: window7, d1: window1 })).supply).toBe(
          7_000_000,
        );
        // d30 explicitly null is nullish too → still falls through.
        expect(
          (await supplyFor({ d30: null, d7: window7, d1: window1 })).supply,
        ).toBe(7_000_000);
        // d30 and d7 gone → d1.
        expect((await supplyFor({ d1: window1 })).supply).toBe(1_000_000);
        // Nothing at all → empty history, 0 headline (never NaN/undefined).
        const none = await supplyFor({});
        expect(none.history).toEqual([]);
        expect(none.supply).toBe(0);
      });

      it("lets a present-but-empty d30 win over a populated d7", async () => {
        // `??` only falls through on null/undefined, so an upstream window that
        // reports zero points is honoured as an answer rather than skipped.
        const out = await supplyFor({ d30: [], d7: window7 });
        expect(out.history).toEqual([]);
        expect(out.supply).toBe(0);
      });
    });

    describe("history mapping", () => {
      it("drops non-finite points and takes the last survivor as supply", async () => {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", gaugeBody()],
            ["/validator-rewards", rewardsBody()],
            ["/burn-rates", burnBody()],
            [
              "/supply-over-time",
              {
                d30: [
                  { supply: 120_400_000, timestamp: "2026-06-26T00:00:00Z" },
                  // Unparseable timestamp → Date.parse NaN → dropped.
                  { supply: 120_390_000, timestamp: "not-a-timestamp" },
                  { supply: 120_380_000, timestamp: "2026-07-11T00:00:00Z" },
                  // Non-numeric supply → Number(...) NaN → dropped. Being LAST
                  // is the sharp case: the headline must fall back to the last
                  // surviving point, never NaN or undefined.
                  { supply: "n/a", timestamp: "2026-07-26T00:00:00Z" },
                ],
              },
            ],
          ]),
        );

        const out = await new UltrasoundProvider().getEthSupply();

        expect(out.history).toEqual([
          { time: D30_TIMES[0], value: 120_400_000 },
          { time: D30_TIMES[1], value: 120_380_000 },
        ]);
        // Headline and the chart's right edge agree by construction.
        expect(out.supply).toBe(120_380_000);
        expect(out.supply).toBe(out.history[out.history.length - 1].value);
      });

      it("coerces a numeric-string supply rather than dropping it", async () => {
        vi.stubGlobal(
          "fetch",
          routedFetch([
            ["/gauge-rates", gaugeBody()],
            ["/validator-rewards", rewardsBody()],
            ["/burn-rates", burnBody()],
            [
              "/supply-over-time",
              {
                d30: [
                  { supply: 120_400_000, timestamp: "2026-06-26T00:00:00Z" },
                  // JSON-encoded as a string upstream: `Number(...)` keeps it,
                  // so the newest reading still drives the headline.
                  { supply: "120355500.5", timestamp: "2026-07-26T00:00:00Z" },
                ],
              },
            ],
          ]),
        );

        const out = await new UltrasoundProvider().getEthSupply();
        expect(out.history).toEqual([
          { time: D30_TIMES[0], value: 120_400_000 },
          { time: D30_TIMES[2], value: 120_355_500.5 },
        ]);
        expect(out.supply).toBe(120_355_500.5);
      });
    });

    describe("caching", () => {
      it("fetches four endpoints once, then serves the 2-minute TTL", async () => {
        vi.useFakeTimers();
        try {
          const fetchMock = allHealthy();
          vi.stubGlobal("fetch", fetchMock);
          const provider = new UltrasoundProvider();

          const first = await provider.getEthSupply();
          expect(fetchMock).toHaveBeenCalledTimes(4);

          // Well inside the 2-minute window → served from the memo, no traffic.
          vi.advanceTimersByTime(90_000);
          expect(await provider.getEthSupply()).toEqual(first);
          expect(fetchMock).toHaveBeenCalledTimes(4);

          // Past it → one more four-endpoint fan-out.
          vi.advanceTimersByTime(45_000);
          expect(await provider.getEthSupply()).toEqual(first);
          expect(fetchMock).toHaveBeenCalledTimes(8);
        } finally {
          vi.useRealTimers();
        }
      });
    });
  });
});
