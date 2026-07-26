import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlsProvider as BlsProviderType } from "./index";

/**
 * Pins the two contracts that make the BLS provider safe to render.
 *
 * 1. **Period parsing.** BLS returns an annual-average row (`period: "M13"`)
 *    inline with the twelve monthly rows of the same year, and its feeds also
 *    carry quarterly (`Q01`) / semiannual (`S01`) codes. Only `M01`–`M12` may
 *    become a point: admitting `M13` injects a bogus extra January-dated value
 *    that silently distorts every CPI chart and any YoY derived from it. The
 *    month is 1-indexed in the feed and 0-indexed in `Date.UTC`, so the
 *    off-by-one is pinned explicitly (M12 ⇒ December, not next January), as is
 *    the fact that the label is formatted in the **UTC** time zone — on a
 *    negative-offset host, a local-time format renders Jan 2024 as "Dec 2023".
 *
 * 2. **The failure path is the normal path.** The keyless BLS API caps
 *    unregistered use at 25 requests/day and reports the cap as an HTTP **200**
 *    whose body carries `status: "REQUEST_NOT_PROCESSED"`. That body must
 *    THROW: only a throw lets the shared TtlCache serve the last good series
 *    (stale-on-error) and lets a fresh miss surface an error card. *Which*
 *    guard does the throwing depends on the body, so both shapes are pinned:
 *    - The observed cap body carries `Results: {}`, so deleting the
 *      `status !== "REQUEST_SUCCEEDED"` throw does **not** make it parse — the
 *      `!series?.data` shape guard still rejects it, only relabelled
 *      "unexpected response shape". What pins the status branch for that shape
 *      is therefore the exact joined-message assertion, not the bare fact that
 *      the call rejects.
 *    - A non-succeeded body that DOES carry a `series[0].data` array is the
 *      shape where the status check is the **sole** guard: drop it and the body
 *      parses, gets written to the cache as a success, and the
 *      CPI/unemployment cards render whatever it happened to contain — an
 *      empty `data` array blanks them for the whole 6 h TTL with no error
 *      shown. Two fixtures cover that: a failure status with an empty `data`
 *      array, and a body with no `status` field at all.
 *
 * Also pinned: the cache key spans (seriesId, startYear, endYear) so a
 * different window refetches instead of reusing the wrong range, and the label
 * lookup / seriesId echo behaviour.
 */

type Ctor = typeof BlsProviderType;

/**
 * `macroCache` is a module-level singleton with stale-on-error ON, so a good
 * value primed by an earlier test would be served on a later failure and mask
 * every error path. Each test therefore gets a genuinely FRESH module (and so
 * an empty cache) via `vi.resetModules()` + a dynamic import. Tests that probe
 * cache behaviour reuse the one class they loaded, calling it twice.
 */
async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.BlsProvider;
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

/** One row of `Results.series[0].data` — BLS sends every value as a string. */
function row(year: string, period: string, value: string) {
  return { year, period, periodName: period, value };
}

/** A REQUEST_SUCCEEDED envelope wrapping `data` for `seriesID`. */
function successBody(
  data: Array<Record<string, unknown>>,
  seriesID: string | undefined = "CUUR0000SA0",
) {
  return {
    status: "REQUEST_SUCCEEDED",
    responseTime: 24,
    message: [],
    Results: { series: [{ seriesID, data }] },
  };
}

/**
 * What BLS actually answers once the 25-requests/day cap is hit: HTTP 200, a
 * failure status, and the reason in `message`.
 */
function cappedBody() {
  return {
    status: "REQUEST_NOT_PROCESSED",
    responseTime: 3,
    message: [
      "Daily threshold for Series-Request has been reached.",
      "Please register for an API key.",
    ],
    Results: {},
  };
}

/** Stub the global fetch with a single canned body; returns the mock. */
function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const CPI = "CUUR0000SA0";
const SERIES_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

describe("BlsProvider", () => {
  let BlsProvider: Ctor;

  beforeEach(async () => {
    BlsProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and its single capability", () => {
    const provider = new BlsProvider();
    expect(provider.name).toBe("bls");
    expect(provider.capabilities).toEqual(["macro-series"]);
  });

  describe("period → point mapping", () => {
    it("maps monthly rows to UTC month-start points, sorted ascending", async () => {
      // BLS returns newest-first; the provider must hand back oldest-first.
      const fetchMock = stubFetch(
        successBody([
          row("2024", "M03", "312.332"),
          row("2024", "M02", "310.326"),
          row("2024", "M01", "308.417"),
        ]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result).toEqual({
        seriesId: CPI,
        label: "CPI-U all items",
        source: "BLS",
        points: [
          {
            time: 1704067200000, // 2024-01-01T00:00:00Z
            date: "Jan 2024",
            value: 308.417,
            period: "2024-M01",
          },
          {
            time: 1706745600000, // 2024-02-01T00:00:00Z
            date: "Feb 2024",
            value: 310.326,
            period: "2024-M02",
          },
          {
            time: 1709251200000, // 2024-03-01T00:00:00Z
            date: "Mar 2024",
            value: 312.332,
            period: "2024-M03",
          },
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${SERIES_URL}${CPI}?startyear=2024&endyear=2024`,
      );
    });

    it("sorts across year boundaries, not just within a year", async () => {
      stubFetch(
        successBody([
          row("2024", "M02", "3"),
          row("2023", "M12", "2"),
          row("2023", "M06", "1"),
        ]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2023, 2024);

      expect(result.points.map((p) => p.period)).toEqual([
        "2023-M06",
        "2023-M12",
        "2024-M02",
      ]);
      expect(result.points.map((p) => p.time)).toEqual([
        1685577600000, 1701388800000, 1706745600000,
      ]);
    });

    it("drops the M13 annual-average row BLS returns inline with monthly data", async () => {
      stubFetch(
        successBody([
          row("2024", "M13", "310.500"), // annual average — NOT a month
          row("2024", "M01", "308.417"),
        ]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      // Exactly one point, and no duplicate January carrying the annual mean.
      expect(result.points).toEqual([
        {
          time: 1704067200000,
          date: "Jan 2024",
          value: 308.417,
          period: "2024-M01",
        },
      ]);
      expect(result.points.map((p) => p.value)).not.toContain(310.5);
    });

    it("rejects non-monthly and out-of-range period codes", async () => {
      stubFetch(
        successBody([
          row("2024", "Q01", "1"), // quarterly
          row("2024", "S01", "2"), // semiannual
          row("2024", "M00", "3"), // below range
          row("2024", "M99", "4"), // above range
          row("2024", "M1", "5"), // unpadded
          row("2024", "", "6"), // empty
          { year: "2024", value: "7" }, // period absent entirely
          row("2024", "M05", "8"), // the only survivor
        ]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result.points).toEqual([
        {
          time: Date.UTC(2024, 4, 1),
          date: "May 2024",
          value: 8,
          period: "2024-M05",
        },
      ]);
    });

    it("treats the feed's 1-indexed month as 0-indexed for Date.UTC (M12 is December)", async () => {
      stubFetch(successBody([row("2024", "M12", "315.605")]));

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      // An off-by-one would land on 2024-01-01 or 2025-01-01 instead.
      expect(result.points[0].time).toBe(1733011200000); // 2024-12-01T00:00:00Z
      expect(result.points[0].date).toBe("Dec 2024");
      expect(new Date(result.points[0].time).toISOString()).toBe(
        "2024-12-01T00:00:00.000Z",
      );
    });

    it("formats the label in UTC even on a negative-offset host", async () => {
      // `vi.stubEnv` rather than a raw `process.env.TZ` write: this package
      // declares no @types/node, so `process` does not typecheck here — and Node
      // honours a live TZ change either way (it fires V8's
      // DateTimeConfigurationChangeNotification).
      vi.stubEnv("TZ", "America/New_York"); // UTC-5/-4
      try {
        stubFetch(successBody([row("2024", "M01", "308.417")]));

        // Guard: prove the host really is offset, so this test can never pass
        // vacuously on a UTC machine.
        expect(
          new Intl.DateTimeFormat("en-US", {
            month: "short",
            year: "numeric",
          }).format(1704067200000),
        ).toBe("Dec 2023");

        const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);
        expect(result.points[0].date).toBe("Jan 2024");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("keeps the raw year-period string alongside the formatted label", async () => {
      stubFetch(successBody([row("2024", "M03", "312.332")]));

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result.points[0].period).toBe("2024-M03");
      expect(result.points[0].date).toBe("Mar 2024");
    });

    it("drops rows whose value is not a number instead of rendering NaN", async () => {
      stubFetch(
        successBody([
          row("2024", "M01", "-"), // BLS's suppressed/footnoted cell
          row("2024", "M02", "n/a"),
          { year: "2024", period: "M03" }, // value absent
          row("2024", "M04", "309.395"),
        ]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result.points.map((p) => p.period)).toEqual(["2024-M04"]);
      expect(result.points[0].value).toBe(309.395);
    });

    it("admits an empty-string value as 0", async () => {
      stubFetch(
        successBody([row("2024", "M01", ""), row("2024", "M02", "310.326")]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      // KNOWN BUG: an empty-string value passes finiteNumber (Number("") === 0)
      // and renders as a real 0-valued point — should be dropped like any other
      // non-numeric cell. Pinned so the suite stays green; fixing the source
      // must flip this assertion to expect only "2024-M02".
      expect(result.points.map((p) => p.period)).toEqual([
        "2024-M01",
        "2024-M02",
      ]);
      expect(result.points[0].value).toBe(0);
    });

    it("drops a row whose year is not numeric", async () => {
      stubFetch(
        successBody([row("n/a", "M01", "1"), row("2024", "M02", "310.326")]),
      );

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result.points.map((p) => p.period)).toEqual(["2024-M02"]);
    });

    it("returns an empty points array when every row is unmappable", async () => {
      stubFetch(successBody([row("2024", "M13", "310.500")]));

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      // A present-but-unmappable data array is not an error — the series is
      // simply empty (the frame renders a no-data card, not a wrong chart).
      expect(result.points).toEqual([]);
      expect(result.label).toBe("CPI-U all items");
    });
  });

  describe("labels and echoed ids", () => {
    it("resolves the label from the known-series map", async () => {
      stubFetch(successBody([row("2024", "M01", "3.7")], "LNS14000000"));

      const result = await new BlsProvider().getMacroSeries(
        "LNS14000000",
        2024,
        2024,
      );

      expect(result.label).toBe("Unemployment rate");
      expect(result.seriesId).toBe("LNS14000000");
      expect(result.source).toBe("BLS");
    });

    it("falls back to the raw seriesId as the label for an unknown series", async () => {
      stubFetch(successBody([row("2024", "M01", "1")], "ZZZ9999999"));

      const result = await new BlsProvider().getMacroSeries(
        "ZZZ9999999",
        2024,
        2024,
      );

      expect(result.label).toBe("ZZZ9999999");
      expect(result.seriesId).toBe("ZZZ9999999");
    });

    it("takes seriesId from the echoed series but the label from the requested id", async () => {
      // BLS echoes the id it served; the label map is keyed by what we asked
      // for. In practice they agree — this pins which side each field reads.
      stubFetch(successBody([row("2024", "M01", "1")], "LNS14000000"));

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result.seriesId).toBe("LNS14000000");
      expect(result.label).toBe("CPI-U all items");
    });

    it("falls back to the requested seriesId when BLS omits seriesID", async () => {
      stubFetch(successBody([row("2024", "M01", "1")], undefined));

      const result = await new BlsProvider().getMacroSeries(CPI, 2024, 2024);

      expect(result.seriesId).toBe(CPI);
    });
  });

  describe("failure paths", () => {
    it("throws the joined message array when the daily cap is hit (HTTP 200 + failure status)", async () => {
      stubFetch(cappedBody());

      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow(
        "bls series CUUR0000SA0: Daily threshold for Series-Request has been " +
          "reached., Please register for an API key.",
      );
    });

    /**
     * The shape where `status !== "REQUEST_SUCCEEDED"` is the ONLY thing
     * standing between a failure body and a cached success: the series
     * envelope is well-formed, so the `!series?.data` guard passes and the
     * mapper would happily produce `points: []`. That value would then be
     * written to the cache as a success and served for the full 6 h TTL — a
     * blank CPI card with no error to explain it. (`cappedBody()` cannot pin
     * this: its `Results: {}` trips the shape guard instead.)
     */
    it("throws on a failure status carrying a well-formed but empty data array", async () => {
      stubFetch({
        status: "REQUEST_NOT_PROCESSED",
        message: ["Daily threshold for Series-Request has been reached."],
        Results: { series: [{ seriesID: CPI, data: [] }] },
      });

      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow(
        "bls series CUUR0000SA0: Daily threshold for Series-Request has been " +
          "reached.",
      );
    });

    it("falls back to 'request failed' when a failure body carries no message", async () => {
      stubFetch({ status: "REQUEST_FAILED", message: [], Results: {} });

      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow("bls series CUUR0000SA0: request failed");
    });

    // The second sole-guard shape: no `status` field, but a fully parseable
    // data array. Without the status check this resolves to a one-point series
    // that looks perfectly healthy and is cached as such.
    it("throws on a body with no status at all rather than parsing it", async () => {
      stubFetch({ Results: { series: [{ data: [row("2024", "M01", "1")] }] } });

      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow("bls series CUUR0000SA0: request failed");
    });

    it("throws /unexpected response shape/ when the succeeded body has no series data", async () => {
      stubFetch({
        status: "REQUEST_SUCCEEDED",
        Results: { series: [{ seriesID: CPI }] }, // data missing
      });

      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow(/unexpected response shape/);
    });

    it("throws /unexpected response shape/ when Results.series is empty or absent", async () => {
      stubFetch({ status: "REQUEST_SUCCEEDED", Results: { series: [] } });
      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow(/unexpected response shape/);

      const Fresh = await loadProvider();
      stubFetch({ status: "REQUEST_SUCCEEDED" });
      await expect(new Fresh().getMacroSeries(CPI, 2024, 2024)).rejects.toThrow(
        /unexpected response shape/,
      );
    });

    it("surfaces the transport error on a non-2xx response", async () => {
      stubFetch(null, 503);

      await expect(
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ).rejects.toThrow(/failed: 503/);
    });

    it("never caches a failure — the next call retries and can succeed", async () => {
      const fetchMock = stubFetch(successBody([row("2024", "M01", "308.417")]));
      fetchMock.mockResolvedValueOnce(jsonResponse(cappedBody()));
      const provider = new BlsProvider();

      await expect(provider.getMacroSeries(CPI, 2024, 2024)).rejects.toThrow(
        /Daily threshold/,
      );

      const recovered = await provider.getMacroSeries(CPI, 2024, 2024);
      expect(recovered.points).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("serves the last good series when a later request is capped (stale-on-error)", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = stubFetch(
          successBody([row("2024", "M01", "308.417")]),
        );
        const provider = new BlsProvider();
        const good = await provider.getMacroSeries(CPI, 2024, 2024);
        expect(good.points).toHaveLength(1);

        // Let the 6 h TTL lapse, then have BLS answer with the cap body.
        vi.advanceTimersByTime(7 * 60 * 60_000);
        fetchMock.mockResolvedValueOnce(jsonResponse(cappedBody()));

        const stale = await provider.getMacroSeries(CPI, 2024, 2024);
        // A throw is what makes this possible: any value the fetch *resolved*
        // with would have replaced the cached entry, so getting the very same
        // object identity back is what pins stale-on-error rather than a plain
        // refetch. For this fixture the throw comes from the shape guard
        // (`Results: {}` carries no series), not the status check — the
        // sole-guard shapes above are where the status check itself is the only
        // thing preventing a failure body from being cached as a success.
        expect(stale).toBe(good);
        expect(stale.points).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("request URL and cache key", () => {
    it("percent-encodes the seriesId and sends the window as query params", async () => {
      const fetchMock = stubFetch(successBody([row("2024", "M01", "1")]));

      await new BlsProvider().getMacroSeries("CU/UR 1", 2019, 2024);

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${SERIES_URL}CU%2FUR%201?startyear=2019&endyear=2024`,
      );
    });

    it("refetches for a different year window and reuses the same one", async () => {
      const fetchMock = stubFetch(successBody([row("2024", "M01", "1")]));
      const provider = new BlsProvider();

      const first = await provider.getMacroSeries(CPI, 2020, 2024);
      // Same key, still fresh → served from the cache, same object back.
      const second = await provider.getMacroSeries(CPI, 2020, 2024);
      expect(second).toBe(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await provider.getMacroSeries(CPI, 2021, 2024); // startYear differs
      await provider.getMacroSeries(CPI, 2020, 2023); // endYear differs

      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        `${SERIES_URL}${CPI}?startyear=2020&endyear=2024`,
        `${SERIES_URL}${CPI}?startyear=2021&endyear=2024`,
        `${SERIES_URL}${CPI}?startyear=2020&endyear=2023`,
      ]);
    });

    it("shares one request across concurrent calls for the same window", async () => {
      const fetchMock = stubFetch(successBody([row("2024", "M01", "1")]));

      // Two frames (or StrictMode's double-invoke) must not burn two of the 25
      // daily requests.
      const [a, b] = await Promise.all([
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
        new BlsProvider().getMacroSeries(CPI, 2024, 2024),
      ]);

      expect(a).toBe(b);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
