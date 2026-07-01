import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXCHANGES,
  evaluate,
  exchangeDateParts,
  formatCountdown,
  isHoliday,
  nextHolidays,
  sortStates,
  type MarketState,
} from "./market-data";

// This module reads no clock of its own — `evaluate`, `nextHolidays`, and
// `exchangeDateParts` all take an explicit `now: Date`, so we pass fixed UTC
// instants and let `Intl.DateTimeFormat` (forced to "en-US" inside the module)
// project them into each exchange's zone. Every instant below was verified
// against the real ICU tz database for its target wall-clock (comments show it).

const NYSE = EXCHANGES.NYSE;
const LSE = EXCHANGES.LSE;
const ASX = EXCHANGES.ASX;
const TSE = EXCHANGES.TSE;
const TADAWUL = EXCHANGES.TADAWUL;

describe("evaluate — NYSE (America/New_York, Mon–Fri 09:30–16:00)", () => {
  it("reports open with minutes-to-close during a weekday mid-session", () => {
    // Wed 2026-06-17 14:00Z = 10:00 EDT — 30m after the open, 360m before close.
    const s = evaluate(NYSE, new Date("2026-06-17T14:00:00Z"));
    expect(s.status).toBe("open");
    // close 16:00 (960m) − now 10:00 (600m) = 360m.
    expect(s.nextChangeMin).toBe(360);
    expect(s.code).toBe("NYSE");
    expect(s.tz).toBe("America/New_York");
  });

  it("reports closed on a Saturday with minutes counting to Monday's open", () => {
    // Sat 2026-06-20 15:00Z = 11:00 EDT. Next open Mon 2026-06-22 09:30 EDT.
    const s = evaluate(NYSE, new Date("2026-06-20T15:00:00Z"));
    expect(s.status).toBe("closed");
    // (1440 − 660 now) + 1 skipped day (Sun) × 1440 + open 570 = 2790m.
    expect(s.nextChangeMin).toBe(2790);
  });

  it("reports closed after the 16:00 close, counting to the next morning's open", () => {
    // Wed 2026-06-17 21:00Z = 17:00 EDT. Next open Thu 2026-06-18 09:30 EDT.
    const s = evaluate(NYSE, new Date("2026-06-17T21:00:00Z"));
    expect(s.status).toBe("closed");
    // (1440 − 1020 now) + open 570 = 990m.
    expect(s.nextChangeMin).toBe(990);
  });

  it("reports closed before the 09:30 open, counting minutes to today's open", () => {
    // Wed 2026-06-17 12:00Z = 08:00 EDT — a trading day, before the open.
    const s = evaluate(NYSE, new Date("2026-06-17T12:00:00Z"));
    expect(s.status).toBe("closed");
    // open 570 − now 480 = 90m (opens later the same day).
    expect(s.nextChangeMin).toBe(90);
  });

  it("reports holiday on Christmas 2026 even though it is a Friday", () => {
    // Fri 2026-12-25 15:00Z = 10:00 EST. In US holiday list; next open Mon 12-28.
    const s = evaluate(NYSE, new Date("2026-12-25T15:00:00Z"));
    expect(s.status).toBe("holiday");
    // (1440 − 600 now) + 2 skipped days (Sat, Sun) × 1440 + open 570 = 4290m.
    expect(s.nextChangeMin).toBe(4290);
  });
});

describe("evaluate — Gulf market Tadawul (Asia/Riyadh, Sun–Thu 10:00–15:00)", () => {
  it("is open on a Sunday (Gulf trading week), not treated as a weekend", () => {
    // Sun 2026-06-14 08:00Z = 11:00 AST — 60m into the 10:00–15:00 session.
    const s = evaluate(TADAWUL, new Date("2026-06-14T08:00:00Z"));
    expect(s.status).toBe("open");
    // close 900 − now 660 = 240m.
    expect(s.nextChangeMin).toBe(240);
  });

  it("is closed on a Friday (the Gulf weekend), counting to Sunday's open", () => {
    // Fri 2026-06-19 08:00Z = 11:00 AST. Fri/Sat are non-trading; next open Sun 06-21 10:00.
    const s = evaluate(TADAWUL, new Date("2026-06-19T08:00:00Z"));
    expect(s.status).toBe("closed");
    // (1440 − 660 now) + 1 skipped day (Sat) × 1440 + open 600 = 2820m.
    expect(s.nextChangeMin).toBe(2820);
  });
});

describe("evaluate — DST is handled via Intl projection, not a fixed offset", () => {
  it("LSE is open at 10:00 BST in summer (UTC+1) for a 09:00Z instant", () => {
    // Wed 2026-06-17 09:00Z = 10:00 BST (British Summer Time). open 08:00.
    const s = evaluate(LSE, new Date("2026-06-17T09:00:00Z"));
    expect(s.status).toBe("open");
    // close 16:30 (990m) − now 10:00 (600m) = 390m.
    expect(s.nextChangeMin).toBe(390);
  });

  it("LSE is closed at 07:00 GMT in winter (UTC+0) before the 08:00 open", () => {
    // Wed 2026-01-07 07:00Z = 07:00 GMT — same instant-of-day as above but the
    // winter offset shifts the wall clock, so it lands before the 08:00 open.
    const s = evaluate(LSE, new Date("2026-01-07T07:00:00Z"));
    expect(s.status).toBe("closed");
    // open 480 − now 420 = 60m (opens later today).
    expect(s.nextChangeMin).toBe(60);
  });

  it("ASX (Southern Hemisphere) is open at 12:00 in both AEST winter and AEDT summer", () => {
    // Wed 2026-06-17 02:00Z = 12:00 AEST (UTC+10). open 10:00 close 16:00.
    const winter = evaluate(ASX, new Date("2026-06-17T02:00:00Z"));
    expect(winter.status).toBe("open");
    expect(winter.nextChangeMin).toBe(240); // 16:00 (960) − 12:00 (720).

    // Wed 2026-01-07 01:00Z = 12:00 AEDT (UTC+11) — summer offset differs by 1h,
    // yet Intl projects it to the same 12:00 wall clock, still mid-session.
    const summer = evaluate(ASX, new Date("2026-01-07T01:00:00Z"));
    expect(summer.status).toBe("open");
    expect(summer.nextChangeMin).toBe(240);
  });
});

describe("evaluate — holidayGroup fallback and per-exchange holidays", () => {
  it("TSE (holidayGroup defaults to its own code) is a holiday on Children's Day", () => {
    // Tue 2026-05-05 05:00Z = 14:00 JST — a weekday, but a listed TSE holiday.
    const s = evaluate(TSE, new Date("2026-05-05T05:00:00Z"));
    expect(s.status).toBe("holiday");
  });

  it("routes NYSE holidays through the shared US group (holidayGroup='US')", () => {
    // Both NYSE and NASDAQ point at the US list; Juneteenth 2026-06-19 (Fri).
    const nyse = evaluate(EXCHANGES.NYSE, new Date("2026-06-19T15:00:00Z"));
    const nasdaq = evaluate(EXCHANGES.NASDAQ, new Date("2026-06-19T15:00:00Z"));
    expect(nyse.status).toBe("holiday");
    expect(nasdaq.status).toBe("holiday");
  });
});

describe("isHoliday", () => {
  it("matches a listed date for an exchange", () => {
    expect(isHoliday("NYSE", "2026-12-25")).toBe(true);
  });

  it("is false for a non-holiday date", () => {
    expect(isHoliday("NYSE", "2026-06-17")).toBe(false);
  });

  it("resolves through holidayGroup: SSE uses the CN list", () => {
    // SSE has holidayGroup "CN"; 2026-10-01 is in CN, not under a bare "SSE" key.
    expect(isHoliday("SSE", "2026-10-01")).toBe(true);
  });

  it("returns false for an unknown exchange code", () => {
    expect(isHoliday("NOPE", "2026-12-25")).toBe(false);
  });
});

describe("nextHolidays", () => {
  it("returns the next n holidays on/after today, sorted ascending", () => {
    // Anchor mid-year so several 2026 holidays remain ahead.
    const now = new Date("2026-06-15T12:00:00Z");
    const out = nextHolidays("NYSE", 3, now);
    expect(out).toEqual(["2026-06-19", "2026-07-03", "2026-09-07"]);
  });

  it("includes today when today is itself a holiday", () => {
    // 2026-12-25 12:00 EST is Christmas; it must be the first entry, not skipped.
    const out = nextHolidays("NYSE", 1, new Date("2026-12-25T17:00:00Z"));
    expect(out).toEqual(["2026-12-25"]);
  });

  it("clamps a negative count to an empty list", () => {
    expect(nextHolidays("NYSE", -5, new Date("2026-06-15T12:00:00Z"))).toEqual(
      [],
    );
  });

  it("returns [] for an unknown exchange code", () => {
    expect(nextHolidays("NOPE", 5, new Date("2026-06-15T12:00:00Z"))).toEqual(
      [],
    );
  });

  it("returns [] once every listed holiday is in the past", () => {
    // After the final 2026 US holiday there are none left in the bundled table.
    expect(nextHolidays("NYSE", 5, new Date("2026-12-31T23:00:00Z"))).toEqual(
      [],
    );
  });
});

describe("exchangeDateParts", () => {
  it("returns the exchange-local date and weekday", () => {
    // Wed 2026-06-17 14:00Z = 10:00 EDT — same calendar day in New York.
    expect(exchangeDateParts("NYSE", new Date("2026-06-17T14:00:00Z"))).toEqual(
      {
        ymd: "2026-06-17",
        dow: 3, // Wednesday
      },
    );
  });

  it("rolls the local date forward across the UTC/Tokyo day boundary", () => {
    // Tue 2026-06-16 23:00Z is already Wed 08:00 in Tokyo.
    expect(exchangeDateParts("TSE", new Date("2026-06-16T23:00:00Z"))).toEqual({
      ymd: "2026-06-17",
      dow: 3,
    });
  });

  it("returns null for an unknown exchange code", () => {
    expect(exchangeDateParts("NOPE", new Date("2026-06-17T14:00:00Z"))).toBe(
      null,
    );
  });
});

describe("formatCountdown", () => {
  it("renders '—' for the negative sentinel", () => {
    expect(formatCountdown(-1)).toBe("—");
  });

  it("renders '<1m' for a sub-minute remainder", () => {
    expect(formatCountdown(0.5)).toBe("<1m");
  });

  it("renders minutes only under an hour", () => {
    expect(formatCountdown(47)).toBe("47m");
  });

  it("renders hours and minutes under a day, flooring fractional minutes", () => {
    // 192.9m → 3h 12m (the .9 is floored away).
    expect(formatCountdown(192.9)).toBe("3h 12m");
  });

  it("renders days and hours (dropping minutes) at a day or more", () => {
    // 2 days 4 hours = 3120m; minutes are intentionally omitted at day scale.
    expect(formatCountdown(2 * 1440 + 4 * 60 + 30)).toBe("2d 4h");
  });
});

describe("sortStates", () => {
  // Minimal structural rows — only the fields each comparator reads.
  const row = (over: Partial<MarketState>): MarketState =>
    ({
      code: "X",
      name: "X",
      city: "",
      country: "",
      website: "",
      mark: "",
      tz: "",
      open: "",
      close: "",
      region: "Americas",
      status: "closed",
      nextChangeMin: 0,
      ...over,
    }) as MarketState;

  it("sorts by name alphabetically", () => {
    const out = sortStates(
      [
        row({ name: "Zurich" }),
        row({ name: "Amsterdam" }),
        row({ name: "Milan" }),
      ],
      "name",
    );
    expect(out.map((r) => r.name)).toEqual(["Amsterdam", "Milan", "Zurich"]);
  });

  it("sorts by status open→holiday→closed, tie-broken by soonest change", () => {
    const out = sortStates(
      [
        row({ name: "closedSoon", status: "closed", nextChangeMin: 30 }),
        row({ name: "openLate", status: "open", nextChangeMin: 300 }),
        row({ name: "holiday", status: "holiday", nextChangeMin: 999 }),
        row({ name: "openSoon", status: "open", nextChangeMin: 10 }),
      ],
      "status",
    );
    expect(out.map((r) => r.name)).toEqual([
      "openSoon", // open, smallest nextChangeMin
      "openLate", // open
      "holiday", // holiday
      "closedSoon", // closed
    ]);
  });

  it("sorts by region in the fixed Americas→Europe→Asia-Pacific→MEA order", () => {
    const out = sortStates(
      [
        row({ name: "a", region: "Middle East / Africa" }),
        row({ name: "b", region: "Americas" }),
        row({ name: "c", region: "Asia-Pacific" }),
        row({ name: "d", region: "Europe" }),
      ],
      "region",
    );
    expect(out.map((r) => r.region)).toEqual([
      "Americas",
      "Europe",
      "Asia-Pacific",
      "Middle East / Africa",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [row({ name: "B" }), row({ name: "A" })];
    const out = sortStates(input, "name");
    expect(input.map((r) => r.name)).toEqual(["B", "A"]); // untouched
    expect(out.map((r) => r.name)).toEqual(["A", "B"]);
  });
});

describe("locale independence", () => {
  beforeEach(() => {
    // Push the host into a non-US locale + a non-UTC zone. The module pins
    // Intl to "en-US" internally, so evaluate() must still key holidays and
    // sessions off the *exchange* zone regardless of the host environment.
    // vi.stubEnv sets process.env without this test needing the node `process`
    // global typed (the frames package ships no @types/node).
    vi.stubEnv("TZ", "Asia/Kolkata");
    vi.stubEnv("LANG", "de_DE.UTF-8");
    vi.stubEnv("LC_ALL", "de_DE.UTF-8");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("computes NYSE state from the exchange zone irrespective of host TZ/locale", () => {
    const s = evaluate(NYSE, new Date("2026-06-17T14:00:00Z"));
    expect(s.status).toBe("open");
    expect(s.nextChangeMin).toBe(360);
  });
});
