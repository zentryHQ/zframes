import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  NationalDebt,
  TreasuryAuction,
  TreasuryAverageRate,
  YieldCurve,
} from "@zframes/spec";

// The TreasuryProvider's four TtlCaches are module-level singletons keyed by a
// fixed namespace, so a value cached by one test would leak into the next. Every
// test therefore imports a FRESH copy of the module (vi.resetModules drops the
// cached module graph) so each gets its own caches. A single test that wants to
// probe cache behaviour (hit / stale-on-error) reuses the ONE provider it
// imported, calling it twice.

type Provider = InstanceType<
  Awaited<typeof import("./index")>["TreasuryProvider"]
>;

async function freshProvider(): Promise<Provider> {
  vi.resetModules();
  const { TreasuryProvider } = await import("./index");
  return new TreasuryProvider();
}

/** A minimal Response-like for a JSON body. */
function jsonRes(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A minimal Response-like for a text (XML) body. */
function textRes(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

/** A non-2xx Response — fetchJson/fetchText throw on it (`res.ok` is false). */
function errorRes(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

/** The upstream URL the global fetch was called with on the Nth call. */
function fetchTarget(mock: ReturnType<typeof vi.fn>, n = 0): string {
  return mock.mock.calls[n][0] as string;
}

// ── Yield-curve XML fixtures ────────────────────────────────────────────────

/** One <m:properties> entry with a date and an arbitrary set of maturity fields. */
function yieldEntry(date: string, fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `<d:${k} m:type="Edm.Double">${v}</d:${k}>`)
    .join("");
  return `<m:properties><d:NEW_DATE m:type="Edm.DateTime">${date}</d:NEW_DATE>${inner}</m:properties>`;
}

function yieldXml(entries: string[]): string {
  return `<?xml version="1.0"?><feed>${entries.join("")}</feed>`;
}

const TWO_POINT_ENTRY = {
  BC_3MONTH: "4.30",
  BC_2YEAR: "3.90",
  BC_10YEAR: "4.46",
  BC_30YEAR: "4.70",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TreasuryProvider — yield curve (XML via fetchText)", () => {
  it("parses maturities into ordered points and picks the latest NEW_DATE block", async () => {
    // Two dated blocks in the same month; the parser must select the later date
    // and skip absent maturity fields (only 3M/2Y/10Y/30Y present here).
    const xml = yieldXml([
      yieldEntry("2026-06-01T00:00:00", {
        BC_3MONTH: "5.00",
        BC_10YEAR: "5.50",
      }),
      yieldEntry("2026-06-18T00:00:00", TWO_POINT_ENTRY),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(textRes(xml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const curve: YieldCurve = await provider.getYieldCurve();

    expect(curve.date).toBe("2026-06-18");
    // Points come out shortest → longest per MATURITIES ordering, and only the
    // four present fields appear (missing maturities are dropped, not zeroed).
    expect(curve.points).toEqual([
      { label: "3M", months: 3, rate: 4.3 },
      { label: "2Y", months: 24, rate: 3.9 },
      { label: "10Y", months: 120, rate: 4.46 },
      { label: "30Y", months: 360, rate: 4.7 },
    ]);
    // Only the current month was fetched — it had data, so no fallback fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the prior month when the current month's XML has no entries", async () => {
    // Deterministic clock so the two expected month URLs are predictable.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 3))); // month idx 6 = July → 202607 then 202606
    const emptyXml = yieldXml([]); // current month: no <m:properties>
    const priorXml = yieldXml([
      yieldEntry("2026-06-30T00:00:00", TWO_POINT_ENTRY),
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textRes(emptyXml))
      .mockResolvedValueOnce(textRes(priorXml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const curve = await provider.getYieldCurve();

    expect(curve.date).toBe("2026-06-30");
    expect(curve.points.map((p) => p.label)).toEqual([
      "3M",
      "2Y",
      "10Y",
      "30Y",
    ]);
    // Two fetches: current month (empty) then the prior month (has data).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchTarget(fetchMock, 0)).toContain(
      "field_tdr_date_value_month=202607",
    );
    expect(fetchTarget(fetchMock, 1)).toContain(
      "field_tdr_date_value_month=202606",
    );
  });

  it("throws when neither month yields a parseable curve", async () => {
    const empty = yieldXml([]);
    const fetchMock = vi.fn().mockResolvedValue(textRes(empty));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    await expect(provider.getYieldCurve()).rejects.toThrow(/no recent data/);
    // Both months were attempted before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a fetch failure for a month as empty and still falls through", async () => {
    // Current month rejects (network); the .catch(()=>\"\") makes it empty, so the
    // loop advances to the prior month, which succeeds — no crash bubbles out.
    const priorXml = yieldXml([
      yieldEntry("2026-05-31T00:00:00", TWO_POINT_ENTRY),
    ]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(textRes(priorXml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const curve = await provider.getYieldCurve();
    expect(curve.date).toBe("2026-05-31");
    expect(curve.points).toHaveLength(4);
  });

  it("drops maturity fields whose value is non-numeric (NaN), keeping the rest", async () => {
    // "n/a" → Number(...) is NaN → dropped, not a crash or a NaN-valued point.
    // NB: an empty tag yields Number("") === 0, which is finite and IS kept —
    // exercised in the next test so both branches of the finite check are pinned.
    const xml = yieldXml([
      yieldEntry("2026-06-18T00:00:00", {
        BC_3MONTH: "4.30",
        BC_2YEAR: "n/a",
        BC_30YEAR: "4.70",
      }),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(textRes(xml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const curve = await provider.getYieldCurve();
    // The "n/a" 2Y point is gone; the two numeric ones remain.
    expect(curve.points).toEqual([
      { label: "3M", months: 3, rate: 4.3 },
      { label: "30Y", months: 360, rate: 4.7 },
    ]);
  });

  it('keeps an empty maturity tag as a 0 point (Number("") is finite)', async () => {
    // Documents the real edge: an empty <d:BC_10YEAR></d:BC_10YEAR> is NOT
    // dropped — Number("") === 0 passes the Number.isFinite gate.
    const xml = yieldXml([
      yieldEntry("2026-06-18T00:00:00", { BC_3MONTH: "4.30", BC_10YEAR: "" }),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(textRes(xml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const curve = await provider.getYieldCurve();
    expect(curve.points).toEqual([
      { label: "3M", months: 3, rate: 4.3 },
      { label: "10Y", months: 120, rate: 0 },
    ]);
  });

  it("returns null-shaped (throws 'no recent data') when a block has a date but zero finite maturities", async () => {
    // A dated block whose only maturity is non-numeric → parseYieldCurve returns
    // null (points empty) → both months null → provider throws.
    const xml = yieldXml([
      yieldEntry("2026-06-18T00:00:00", { BC_3MONTH: "junk" }),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(textRes(xml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    await expect(provider.getYieldCurve()).rejects.toThrow(/no recent data/);
  });

  it("sends proxied:true on the browser path (same-origin proxy route)", async () => {
    // Simulate the browser (document defined) so fetch.ts rewrites the proxied
    // request to the same-origin /__zframes/proxy?url=… route.
    vi.stubGlobal("document", {} as Document);
    const xml = yieldXml([yieldEntry("2026-06-18T00:00:00", TWO_POINT_ENTRY)]);
    const fetchMock = vi.fn().mockResolvedValue(textRes(xml));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    await provider.getYieldCurve();

    const target = fetchTarget(fetchMock, 0);
    expect(target.startsWith("/__zframes/proxy?url=")).toBe(true);
    // The real upstream URL is URL-encoded inside the proxy query.
    expect(target).toContain(encodeURIComponent("https://home.treasury.gov"));
  });
});

describe("TreasuryProvider — average interest rates (Fiscal Data JSON)", () => {
  it("keeps only rows of the newest record_date and drops rows missing a field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [
          // newest date — the one we keep
          {
            record_date: "2026-05-31",
            security_type_desc: "Marketable",
            security_desc: "Treasury Notes",
            avg_interest_rate_amt: "3.690",
          },
          // same newest date but missing security_desc → dropped
          {
            record_date: "2026-05-31",
            security_type_desc: "Marketable",
            avg_interest_rate_amt: "4.100",
          },
          // same newest date but non-numeric rate → dropped
          {
            record_date: "2026-05-31",
            security_type_desc: "Marketable",
            security_desc: "Bills",
            avg_interest_rate_amt: "null",
          },
          // an older date → excluded entirely (only latestDate kept)
          {
            record_date: "2026-04-30",
            security_type_desc: "Marketable",
            security_desc: "Treasury Bonds",
            avg_interest_rate_amt: "4.500",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const rates: TreasuryAverageRate[] =
      await provider.getTreasuryAverageRates();
    expect(rates).toEqual([
      {
        date: "2026-05-31",
        securityType: "Marketable",
        security: "Treasury Notes",
        rate: 3.69,
      },
    ]);
  });

  it("returns [] when no row carries a record_date", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonRes({ data: [{ security_desc: "x", avg_interest_rate_amt: "1" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    expect(await provider.getTreasuryAverageRates()).toEqual([]);
  });

  it("throws when the payload has no data array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({ notData: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await expect(provider.getTreasuryAverageRates()).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it("throws on a non-2xx upstream (fetchJson rejects)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorRes(429));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await expect(provider.getTreasuryAverageRates()).rejects.toThrow(/429/);
  });
});

describe("TreasuryProvider — national debt (newest-first payload → oldest-first trend)", () => {
  it("sorts the trend oldest→newest and derives latest fields from row 0", async () => {
    // Fiscal Data returns newest → oldest; the trend must come out oldest → newest.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [
          {
            record_date: "2026-06-17",
            tot_pub_debt_out_amt: "37000000000000.00",
            debt_held_public_amt: "29000000000000.00",
            intragov_hold_amt: "8000000000000.00",
          },
          {
            record_date: "2026-06-16",
            tot_pub_debt_out_amt: "36900000000000.00",
            debt_held_public_amt: "28900000000000.00",
            intragov_hold_amt: "8000000000000.00",
          },
          {
            record_date: "2026-06-13",
            tot_pub_debt_out_amt: "36800000000000.00",
            debt_held_public_amt: "28800000000000.00",
            intragov_hold_amt: "8000000000000.00",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const debt: NationalDebt = await provider.getNationalDebt(101);

    // latest fields come from row 0 (the newest)
    expect(debt.date).toBe("2026-06-17");
    expect(debt.total).toBe(37_000_000_000_000);
    expect(debt.heldByPublic).toBe(29_000_000_000_000);
    expect(debt.intragovernmental).toBe(8_000_000_000_000);
    // trend reversed to oldest → newest
    expect(debt.trend.map((p) => p.date)).toEqual([
      "2026-06-13",
      "2026-06-16",
      "2026-06-17",
    ]);
    expect(debt.trend.map((p) => p.total)).toEqual([
      36_800_000_000_000, 36_900_000_000_000, 37_000_000_000_000,
    ]);
    // time is parsed as UTC midnight of the record date
    expect(debt.trend[0].time).toBe(Date.parse("2026-06-13T00:00:00Z"));
  });

  it("skips rows with a missing total or unparseable date when building the trend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [
          { record_date: "2026-06-17", tot_pub_debt_out_amt: "37000000000000" },
          // no total → skipped
          { record_date: "2026-06-16" },
          // unparseable date → skipped
          { record_date: "not-a-date", tot_pub_debt_out_amt: "1" },
          { record_date: "2026-06-13", tot_pub_debt_out_amt: "36800000000000" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const debt = await provider.getNationalDebt(102);
    expect(debt.trend.map((p) => p.date)).toEqual(["2026-06-13", "2026-06-17"]);
    // Missing latest split fields default to 0.
    expect(debt.heldByPublic).toBe(0);
    expect(debt.intragovernmental).toBe(0);
  });

  it("throws when data is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await expect(provider.getNationalDebt(103)).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it("throws when every row is unusable (no usable rows)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonRes({ data: [{ record_date: "bad", tot_pub_debt_out_amt: "x" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await expect(provider.getNationalDebt(104)).rejects.toThrow(
      /no usable rows/,
    );
  });

  it("clamps the requested page size into [2,400]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [{ record_date: "2026-06-17", tot_pub_debt_out_amt: "1" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    // 1 → clamped up to 2, and 9999 → clamped down to 400.
    await provider.getNationalDebt(1);
    await provider.getNationalDebt(9999);
    expect(fetchTarget(fetchMock, 0)).toContain("page%5Bsize%5D=2");
    expect(fetchTarget(fetchMock, 1)).toContain("page%5Bsize%5D=400");
  });
});

describe("TreasuryProvider — auctions (Fiscal Data JSON)", () => {
  it("prefers high_yield, falls back to high_investment_rate, and drops rows missing date/type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [
          // note: uses high_yield
          {
            auction_date: "2026-06-18",
            security_type: "Note",
            security_term: "10-Year",
            high_yield: "4.460",
            bid_to_cover_ratio: "2.55",
            offering_amt: "39000000000",
            total_accepted: "38999000000",
          },
          // bill: no high_yield → falls back to high_investment_rate
          {
            auction_date: "2026-06-17",
            security_type: "Bill",
            security_term: "4-Week",
            high_discnt_rate: "5.10",
            high_investment_rate: "5.28",
            bid_to_cover_ratio: "3.10",
          },
          // missing security_type → dropped
          { auction_date: "2026-06-16" },
          // missing auction_date → dropped
          { security_type: "Bond" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const auctions: TreasuryAuction[] = await provider.getTreasuryAuctions(9);
    expect(auctions).toEqual([
      {
        auctionDate: "2026-06-18",
        securityType: "Note",
        securityTerm: "10-Year",
        rate: 4.46,
        bidToCover: 2.55,
        offeringAmount: 39_000_000_000,
        totalAccepted: 38_999_000_000,
      },
      {
        auctionDate: "2026-06-17",
        securityType: "Bill",
        securityTerm: "4-Week",
        rate: 5.28, // coupon-equivalent investment rate
        bidToCover: 3.1,
        offeringAmount: null,
        totalAccepted: null,
      },
    ]);
  });

  it("yields rate null and securityTerm '' when both rate fields and term are absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [{ auction_date: "2026-06-18", security_type: "Note" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    const auctions = await provider.getTreasuryAuctions(10);
    expect(auctions).toHaveLength(1);
    expect(auctions[0].rate).toBeNull();
    expect(auctions[0].securityTerm).toBe("");
    expect(auctions[0].bidToCover).toBeNull();
  });

  it("throws when the payload has no data array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({}));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await expect(provider.getTreasuryAuctions(11)).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it("clamps the requested limit into [1,30]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await provider.getTreasuryAuctions(0); // → 1
    await provider.getTreasuryAuctions(500); // → 30
    expect(fetchTarget(fetchMock, 0)).toContain("page%5Bsize%5D=1");
    expect(fetchTarget(fetchMock, 1)).toContain("page%5Bsize%5D=30");
  });
});

describe("TreasuryProvider — TtlCache behaviour", () => {
  it("serves a cached value on a second call without re-fetching (hit)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes({
        data: [
          {
            record_date: "2026-06-17",
            tot_pub_debt_out_amt: "37000000000000",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const first = await provider.getNationalDebt(200);
    const second = await provider.getNationalDebt(200);
    expect(second.total).toBe(first.total);
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call was a cache hit
  });

  it("keeps arg-keyed caches (days) independent", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call++;
      const total = String(37_000_000_000_000 + call);
      return jsonRes({
        data: [{ record_date: "2026-06-17", tot_pub_debt_out_amt: total }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const d30 = await provider.getNationalDebt(30);
    const d90 = await provider.getNationalDebt(90);
    // Different days → different cache keys → two distinct fetches / values.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(d30.total).not.toBe(d90.total);
    // Re-requesting an already-seen key hits its own cache, not the other's.
    const d30again = await provider.getNationalDebt(30);
    expect(d30again.total).toBe(d30.total);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps arg-keyed auction caches (limit) independent", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call++;
      return jsonRes({
        data: [
          {
            auction_date: "2026-06-18",
            security_type: "Note",
            high_yield: String(4 + call / 100),
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const a5 = await provider.getTreasuryAuctions(5);
    const a8 = await provider.getTreasuryAuctions(8);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a5[0].rate).not.toBe(a8[0].rate);
  });

  it("serves the last good value when a later refresh fails (stale-on-error)", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      n++;
      if (n === 1) {
        return jsonRes({
          data: [
            {
              record_date: "2026-06-17",
              tot_pub_debt_out_amt: "37000000000000",
            },
          ],
        });
      }
      throw new Error("upstream 500");
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = await freshProvider();
    const first = await provider.getNationalDebt(300);
    expect(first.total).toBe(37_000_000_000_000);

    // Advance past the 3-hour TTL so the next get triggers a (failing) refresh.
    vi.advanceTimersByTime(3 * 60 * 60_000 + 1000);
    const stale = await provider.getNationalDebt(300);
    // The failed refresh is swallowed; the last good value is served.
    expect(stale.total).toBe(37_000_000_000_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("TreasuryProvider — capabilities", () => {
  it("advertises exactly the four Treasury capabilities", async () => {
    const provider = await freshProvider();
    expect(provider.name).toBe("treasury");
    expect([...provider.capabilities].sort()).toEqual([
      "national-debt",
      "treasury-auctions",
      "treasury-rates",
      "yield-curve",
    ]);
  });
});
