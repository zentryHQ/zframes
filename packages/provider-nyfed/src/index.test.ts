import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NyFedProvider as NyFedProviderType } from "./index";

// ratesCache is a module-level singleton, so each test gets a fresh module
// (fresh, empty cache) via vi.resetModules() + a dynamic import — the isolation
// the CoinGecko/GeckoTerminal provider tests established, so stale-on-error
// can't serve an earlier test's value into a later error-path assertion.
//
// Why this provider earns a suite when most thin ones don't (decisions/testing
// § 2213: bespoke parsing or derivation whose regression would be SILENT, not
// merely a public method): the NY Fed publishes a heterogeneous rate board, and
// three pieces of logic here decide what a card shows without ever failing
// loudly —
//   * `percentRate ?? average30day`, because SOFRAI publishes no percentRate at
//     all and would otherwise vanish from the board;
//   * a fixed display order with unknown codes pushed last;
//   * a per-row drop for incomplete entries, and six optional fields attached
//     only when finite.
// Each renders as a plausible rate board when wrong. The daily live smoke probes
// this endpoint's SHAPE, which is a different question from whether the SOFRAI
// fallback still resolves.
type Ctor = typeof NyFedProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.NyFedProvider;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** One entry of the NY Fed /rates/all/latest.json refRates array. */
function refRate(type: string, extra: Record<string, unknown> = {}) {
  return {
    type,
    effectiveDate: "2026-08-01",
    percentRate: 5.31,
    ...extra,
  };
}

function ratesBody(...entries: ReturnType<typeof refRate>[]) {
  return { refRates: entries };
}

describe("NyFedProvider", () => {
  let NyFedProvider: Ctor;

  beforeEach(async () => {
    NyFedProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capability", () => {
    const provider = new NyFedProvider();
    expect(provider.name).toBe("nyfed");
    expect(provider.capabilities).toEqual(["reference-rates"]);
  });

  describe("rate resolution", () => {
    it("reads percentRate when the series publishes one", async () => {
      stubFetch(ratesBody(refRate("EFFR", { percentRate: 4.33 })));

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate.rate).toBe(4.33);
    });

    it("falls back to average30day for SOFRAI, which has no percentRate", async () => {
      // SOFRAI is the averages series — it publishes ONLY the 30/90/180-day
      // averages. Without this fallback its row is dropped entirely and the
      // rate board silently loses a line rather than erroring.
      stubFetch(
        ratesBody(
          refRate("SOFRAI", { percentRate: undefined, average30day: 4.41 }),
        ),
      );

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate.code).toBe("SOFRAI");
      expect(rate.rate).toBe(4.41);
    });

    it("keeps a legitimate 0.00 rate instead of treating it as missing", async () => {
      // The fallback is `??`, not `||`. A zero policy rate is real (2020-2021
      // EFFR sat at 0.05-0.09, and a floor of exactly 0 is publishable), so a
      // truthiness check would replace it with average30day — or drop the row.
      stubFetch(
        ratesBody(refRate("EFFR", { percentRate: 0, average30day: 4.41 })),
      );

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate.rate).toBe(0);
    });

    it("coerces a string-typed rate rather than dropping the row", async () => {
      stubFetch(
        ratesBody(
          refRate("SOFR", { percentRate: "5.32" as unknown as number }),
        ),
      );

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate.rate).toBe(5.32);
    });
  });

  describe("row filtering", () => {
    it("drops an entry with no usable rate on either field", async () => {
      stubFetch(
        ratesBody(
          refRate("EFFR"),
          refRate("OBFR", { percentRate: undefined, average30day: undefined }),
        ),
      );

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.code)).toEqual(["EFFR"]);
    });

    it("drops an entry with a non-numeric rate rather than emitting NaN", async () => {
      stubFetch(
        ratesBody(
          refRate("EFFR"),
          refRate("SOFR", { percentRate: "n/a" as unknown as number }),
        ),
      );

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.code)).toEqual(["EFFR"]);
      expect(rates.every((r) => Number.isFinite(r.rate))).toBe(true);
    });

    it("drops an entry with no effective date", async () => {
      // The date is rendered as the rate's as-of; an undated rate would read as
      // current when it may not be.
      stubFetch(
        ratesBody(
          refRate("EFFR"),
          refRate("SOFR", { effectiveDate: undefined }),
        ),
      );

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.code)).toEqual(["EFFR"]);
    });

    it("drops an entry with no type code", async () => {
      stubFetch(ratesBody(refRate("EFFR"), refRate("" as string)));

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.code)).toEqual(["EFFR"]);
    });

    it("returns an empty array, not an error, when every row is unusable", async () => {
      stubFetch(ratesBody(refRate("EFFR", { effectiveDate: undefined })));

      await expect(new NyFedProvider().getReferenceRates()).resolves.toEqual(
        [],
      );
    });
  });

  describe("display order", () => {
    it("sorts into the published board order regardless of API order", async () => {
      // The API returns rates in its own order; the card reads top-down as a
      // policy board (fed funds first, then secured rates). Losing the sort
      // reorders the board without any other visible symptom.
      stubFetch(
        ratesBody(
          refRate("SOFRAI", { percentRate: undefined, average30day: 1 }),
          refRate("OBFR"),
          refRate("BGCR"),
          refRate("TGCR"),
          refRate("SOFR"),
          refRate("EFFR"),
        ),
      );

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.code)).toEqual([
        "EFFR",
        "SOFR",
        "TGCR",
        "BGCR",
        "OBFR",
        "SOFRAI",
      ]);
    });

    it("sorts an unrecognised code last rather than first", async () => {
      // Index -1 is mapped to 99 on purpose; using the raw -1 would float any
      // newly-published series to the top of the board.
      stubFetch(
        ratesBody(refRate("NEWRATE"), refRate("SOFR"), refRate("EFFR")),
      );

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.code)).toEqual(["EFFR", "SOFR", "NEWRATE"]);
    });
  });

  describe("labels and optional fields", () => {
    it("maps each known code to its display label", async () => {
      stubFetch(
        ratesBody(
          refRate("EFFR"),
          refRate("SOFR"),
          refRate("TGCR"),
          refRate("BGCR"),
          refRate("OBFR"),
        ),
      );

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.map((r) => r.label)).toEqual([
        "Effective fed funds",
        "SOFR",
        "Tri-party repo",
        "Broad general collateral",
        "Overnight bank funding",
      ]);
    });

    it("falls back to the raw code as the label for an unknown series", async () => {
      stubFetch(ratesBody(refRate("NEWRATE")));

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate.label).toBe("NEWRATE");
    });

    it("attaches the optional volume, target band and averages when present", async () => {
      stubFetch(
        ratesBody(
          refRate("EFFR", {
            volumeInBillions: 98,
            targetRateFrom: 4.25,
            targetRateTo: 4.5,
            average30day: 4.31,
            average90day: 4.36,
            average180day: 4.42,
          }),
        ),
      );

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate).toEqual({
        code: "EFFR",
        label: "Effective fed funds",
        date: "2026-08-01",
        rate: 5.31,
        source: "New York Fed",
        volumeInBillions: 98,
        targetRateFrom: 4.25,
        targetRateTo: 4.5,
        average30Day: 4.31,
        average90Day: 4.36,
        average180Day: 4.42,
      });
    });

    it("omits an optional field entirely rather than setting it undefined", async () => {
      // The card renders a field when the key is present; an explicit undefined
      // would still be "present" to a `in`/Object.keys check downstream.
      stubFetch(ratesBody(refRate("EFFR")));

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect("volumeInBillions" in rate).toBe(false);
      expect("targetRateFrom" in rate).toBe(false);
      expect("average30Day" in rate).toBe(false);
    });

    it("keeps a zero target-band floor instead of dropping it as falsy", async () => {
      // A 0-0.25% band is the historical ZIRP setting; a truthiness guard would
      // drop the lower bound and render an open-ended band.
      stubFetch(
        ratesBody(refRate("EFFR", { targetRateFrom: 0, targetRateTo: 0.25 })),
      );

      const [rate] = await new NyFedProvider().getReferenceRates();

      expect(rate.targetRateFrom).toBe(0);
      expect(rate.targetRateTo).toBe(0.25);
    });

    it("stamps every rate with the New York Fed as its source", async () => {
      stubFetch(ratesBody(refRate("EFFR"), refRate("SOFR")));

      const rates = await new NyFedProvider().getReferenceRates();

      expect(rates.every((r) => r.source === "New York Fed")).toBe(true);
    });
  });

  describe("transport and cache", () => {
    it("requests the published latest-rates endpoint", async () => {
      const fetchMock = stubFetch(ratesBody(refRate("EFFR")));

      await new NyFedProvider().getReferenceRates();

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://markets.newyorkfed.org/api/rates/all/latest.json",
      );
    });

    it("throws a labelled error when refRates is missing or not an array", async () => {
      stubFetch({ error: "unavailable" });

      await expect(new NyFedProvider().getReferenceRates()).rejects.toThrow(
        "ny fed rates: unexpected response shape",
      );
    });

    it("surfaces the transport error on a non-2xx response", async () => {
      stubFetch(null, 503);

      await expect(new NyFedProvider().getReferenceRates()).rejects.toThrow(
        /failed: 503/,
      );
    });

    it("serves a second read from cache without re-fetching", async () => {
      // Overnight rates publish once a business day, so every rate card on the
      // board must share one request.
      const fetchMock = stubFetch(ratesBody(refRate("EFFR")));

      const first = await new NyFedProvider().getReferenceRates();
      const second = await new NyFedProvider().getReferenceRates();

      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("dedupes concurrent in-flight requests", async () => {
      const fetchMock = stubFetch(ratesBody(refRate("EFFR")));

      const provider = new NyFedProvider();
      await Promise.all([
        provider.getReferenceRates(),
        provider.getReferenceRates(),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
