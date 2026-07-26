import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinraProvider as FinraProviderType } from "./index";

// What this file pins, and why it matters:
//
//  1. **The report parser.** FINRA publishes a pipe-delimited text file whose
//     first line is a header and whose tail can hold a footer/blank line. Every
//     guard in `parseReport` (header skip, field-count, empty symbol, non-finite
//     volumes, the divide-by-zero `shortPct` guard, the `|| 0` short-exempt
//     coercion) is pinned here, because a regression turns a real row into a
//     `NaN`/`Infinity` percentage rendered straight onto a card.
//  2. **Symbol keying.** Short-volume frames pin cards to HIP-3 symbols like
//     `xyz:TSLA`. The provider must look the report up by the BARE, upper-cased
//     ticker but key the returned record by the symbol the caller asked for — if
//     that ever flips to the bare ticker, every HIP-3 card goes permanently
//     blank while a plain-ticker board keeps working (a silent, board-specific
//     failure). Symbols absent from the file must be omitted, never emitted as
//     `undefined` entries.
//  3. **The business-day walk-back.** The file lands a business day late, so the
//     loader steps back one UTC day at a time from today. The exact
//     `CNMSshvol<YYYYMMDD>.txt` URL sequence is asserted (zero-padded month/day,
//     across a month and a year boundary) because an off-by-one or an unpadded
//     component means every Monday morning shows nothing, with no error to
//     explain it. It must also step back on a file that fetches OK but parses
//     empty, stop at the first success, and give up after eight attempts.
//  4. **Transport.** cdn.finra.org sends no CORS headers, so every attempt has
//     to go through the runtime's same-origin proxy in the browser, with the
//     long 15s timeout the big text file needs.
//
// `reportCache` is a module-level singleton whose single `"latest"` slot is
// shared by every provider instance and, with stale-on-error on by default,
// would serve a value primed by an earlier test on a later failure — masking
// every error path. So each test gets a genuinely FRESH module (and therefore an
// empty cache) via `vi.resetModules()` + a dynamic import.
type Ctor = typeof FinraProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.FinraProvider;
}

/** A minimal Response-like the stubbed global fetch resolves to (FINRA serves plain text). */
function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

/** The exact daily-file URL the loader is expected to build. */
function dailyUrl(yyyymmdd: string) {
  return `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${yyyymmdd}.txt`;
}

const HEADER = "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market";

/** A published file: header line, rows, then the blank trailing line the real file has. */
function file(rows: string[]) {
  return [HEADER, ...rows, ""].join("\r\n");
}

/** Stub fetch so the FIRST walk-back attempt resolves with `text`. */
function stubFile(text: string) {
  const fetchMock = vi.fn().mockResolvedValue(textResponse(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FinraProvider", () => {
  let FinraProvider: Ctor;

  beforeEach(async () => {
    // Fresh module → fresh, empty module-level report cache for this test.
    FinraProvider = await loadProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new FinraProvider();
    expect(provider.name).toBe("finra");
    expect(provider.capabilities).toEqual(["short-volume"]);
  });

  describe("report parsing", () => {
    it("maps a row to a ShortVolumeEntry with an ISO date and shortPct", async () => {
      stubFile(file(["20260618|TSLA|1000|50|4000|C"]));

      const out = await new FinraProvider().getShortVolume(["TSLA"]);

      expect(out).toEqual({
        TSLA: {
          date: "2026-06-18",
          symbol: "TSLA",
          shortVolume: 1000,
          shortExemptVolume: 50,
          totalVolume: 4000,
          shortPct: 25,
        },
      });
    });

    it("skips the header line instead of emitting a 'Symbol' row", async () => {
      stubFile(file(["20260618|TSLA|1000|50|4000|C"]));

      const out = await new FinraProvider().getShortVolume([
        "Symbol",
        "SYMBOL",
        "TSLA",
      ]);

      // The header's own "Symbol" field must never become a tradable entry.
      expect(Object.keys(out)).toEqual(["TSLA"]);
    });

    it("skips short lines (footer/blank) and rows with no symbol", async () => {
      stubFile(
        file([
          "20260618|TSLA|1000|50|4000|C",
          "20260618|SHORT|1|2", // only 4 fields → dropped
          "", // blank line → dropped
          "Records: 8123", // footer prose → dropped
          "20260618||900|0|3000|C", // empty symbol → dropped
        ]),
      );

      const out = await new FinraProvider().getShortVolume([
        "SHORT",
        "",
        "TSLA",
      ]);

      expect(Object.keys(out)).toEqual(["TSLA"]);
      expect(out.TSLA.shortVolume).toBe(1000);
    });

    it("drops rows whose short or total volume is non-finite", async () => {
      stubFile(
        file([
          "20260618|BADSHORT|abc|0|4000|C",
          "20260618|BADTOTAL|1000|0|n/a|C",
          "20260618|GOOD|1000|0|4000|C",
        ]),
      );

      const out = await new FinraProvider().getShortVolume([
        "BADSHORT",
        "BADTOTAL",
        "GOOD",
      ]);

      expect(Object.keys(out)).toEqual(["GOOD"]);
      expect(out.GOOD.shortPct).toBe(25);
    });

    it("keeps an empty numeric volume field as 0 (Number('') is finite)", async () => {
      stubFile(file(["20260618|EMPTY||0|4000|C"]));

      const out = await new FinraProvider().getShortVolume(["EMPTY"]);

      // `Number("")` is 0, which passes the finite guard — the row survives with
      // a zero short volume rather than being dropped.
      expect(out.EMPTY.shortVolume).toBe(0);
      expect(out.EMPTY.shortPct).toBe(0);
    });

    it("guards shortPct to 0 when totalVolume is 0 (no Infinity/NaN)", async () => {
      stubFile(file(["20260618|ZERO|500|0|0|C"]));

      const out = await new FinraProvider().getShortVolume(["ZERO"]);

      expect(out.ZERO.totalVolume).toBe(0);
      expect(out.ZERO.shortPct).toBe(0);
      expect(Number.isFinite(out.ZERO.shortPct)).toBe(true);
    });

    it("coerces a garbage or empty short-exempt field to 0, never NaN", async () => {
      stubFile(
        file([
          "20260618|GARBAGE|1000|n/a|4000|C",
          "20260618|BLANK|1000||4000|C",
          "20260618|REAL|1000|7|4000|C",
        ]),
      );

      const out = await new FinraProvider().getShortVolume([
        "GARBAGE",
        "BLANK",
        "REAL",
      ]);

      expect(out.GARBAGE.shortExemptVolume).toBe(0);
      expect(out.BLANK.shortExemptVolume).toBe(0);
      expect(out.REAL.shortExemptVolume).toBe(7);
    });

    it("reformats the first YYYYMMDD row date to ISO and reuses it for later rows", async () => {
      stubFile(
        file([
          "18/06/2026|EARLY|10|0|100|C", // no 8-digit date yet → keeps its raw date
          "20260702|MID|20|0|200|C", // first ^\d{8}$ row → sets the ISO date
          "bogus|LATE|30|0|300|C", // inherits the resolved ISO date
        ]),
      );

      const out = await new FinraProvider().getShortVolume([
        "EARLY",
        "MID",
        "LATE",
      ]);

      // Zero-padded month/day survive the YYYYMMDD → YYYY-MM-DD reformat.
      expect(out.MID.date).toBe("2026-07-02");
      expect(out.LATE.date).toBe("2026-07-02");
      // A row parsed BEFORE the first valid date row falls back to its raw date.
      expect(out.EARLY.date).toBe("18/06/2026");
    });

    it("falls back to the raw date when no row carries a YYYYMMDD date", async () => {
      stubFile(file(["2026-06-18|TSLA|1000|0|4000|C"]));

      const out = await new FinraProvider().getShortVolume(["TSLA"]);

      expect(out.TSLA.date).toBe("2026-06-18");
    });

    it("upper-cases the lookup key but emits the file's original symbol casing", async () => {
      stubFile(file(["20260618|tsla|1000|0|4000|C"]));
      const provider = new FinraProvider();

      const upper = await provider.getShortVolume(["TSLA"]);
      const lower = await provider.getShortVolume(["tsla"]);

      // Keyed by the upper-cased ticker in the report map …
      expect(Object.keys(upper)).toEqual(["TSLA"]);
      expect(Object.keys(lower)).toEqual(["tsla"]);
      // … while the emitted `symbol` keeps the casing the file used.
      expect(upper.TSLA.symbol).toBe("tsla");
      expect(lower.tsla.symbol).toBe("tsla");
    });
  });

  describe("business-day walk-back", () => {
    it("steps back one UTC day at a time and stops at the first success", async () => {
      vi.useFakeTimers();
      // Monday 2026-03-02 — the weekend before it has no published file, and
      // stepping back crosses a month boundary onto a zero-padded day.
      vi.setSystemTime(new Date("2026-03-02T05:00:00Z"));
      const fetchMock = vi
        .fn()
        .mockImplementation((target: string) =>
          Promise.resolve(
            target.includes("20260228")
              ? textResponse(file(["20260228|TSLA|1000|0|4000|C"]))
              : textResponse("", 404),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);

      const out = await new FinraProvider().getShortVolume(["TSLA"]);

      expect(fetchMock.mock.calls.map((c) => c[0] as string)).toEqual([
        dailyUrl("20260302"),
        dailyUrl("20260301"),
        dailyUrl("20260228"),
      ]);
      // Stopped at the first success — no fourth attempt.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(out.TSLA.shortVolume).toBe(1000);
      expect(out.TSLA.date).toBe("2026-02-28");
    });

    it("steps back when a file fetches OK but parses empty", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-18T10:00:00Z"));
      const fetchMock = vi.fn().mockImplementation((target: string) =>
        Promise.resolve(
          target.includes("20260617")
            ? textResponse(file(["20260617|TSLA|1000|0|4000|C"]))
            : // A published-but-empty file (header only, no rows) — a 200 that
              // yields zero parsed rows must be treated like a miss.
              textResponse(file([])),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const out = await new FinraProvider().getShortVolume(["TSLA"]);

      expect(fetchMock.mock.calls.map((c) => c[0] as string)).toEqual([
        dailyUrl("20260618"),
        dailyUrl("20260617"),
      ]);
      expect(out.TSLA.date).toBe("2026-06-17");
    });

    it("gives up after eight attempts, walking back across a year boundary", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-03T12:00:00Z"));
      const fetchMock = vi.fn().mockResolvedValue(textResponse("", 404));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        new FinraProvider().getShortVolume(["TSLA"]),
      ).rejects.toThrow(/no recent short-volume file found/);

      // Today + MAX_LOOKBACK_DAYS(7) = 8 attempts, zero-padded across the
      // 2026 → 2025 rollover.
      expect(fetchMock.mock.calls.map((c) => c[0] as string)).toEqual([
        dailyUrl("20260103"),
        dailyUrl("20260102"),
        dailyUrl("20260101"),
        dailyUrl("20251231"),
        dailyUrl("20251230"),
        dailyUrl("20251229"),
        dailyUrl("20251228"),
        dailyUrl("20251227"),
      ]);
    });

    it("routes every attempt through the same-origin proxy with a 15s timeout", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-02T05:00:00Z"));
      // Simulate a browser so the shared transport takes its proxy-rewrite
      // branch — cdn.finra.org is CORS-blocked there.
      vi.stubGlobal("document", {});
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      const fetchMock = vi
        .fn()
        .mockImplementation((target: string) =>
          Promise.resolve(
            target.includes("20260228")
              ? textResponse(file(["20260228|TSLA|1000|0|4000|C"]))
              : textResponse("", 404),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);

      await new FinraProvider().getShortVolume(["TSLA"]);

      expect(fetchMock.mock.calls.map((c) => c[0] as string)).toEqual([
        `/__zframes/proxy?url=${encodeURIComponent(dailyUrl("20260302"))}`,
        `/__zframes/proxy?url=${encodeURIComponent(dailyUrl("20260301"))}`,
        `/__zframes/proxy?url=${encodeURIComponent(dailyUrl("20260228"))}`,
      ]);
      // Every attempt gets the long timeout the ~10 MB text file needs.
      expect(timeoutSpy.mock.calls).toEqual([[15_000], [15_000], [15_000]]);
    });
  });

  describe("getShortVolume", () => {
    it("looks up the bare ticker but keys the result by the requested symbol", async () => {
      stubFile(file(["20260618|TSLA|1000|50|4000|C"]));

      const out = await new FinraProvider().getShortVolume([
        "xyz:TSLA",
        "xyz:tsla",
        "TSLA",
      ]);

      // HIP-3 prefixes are stripped for the lookup, and the caller gets its own
      // symbol strings back as keys — a card configured with "xyz:TSLA" reads
      // out["xyz:TSLA"].
      expect(Object.keys(out)).toEqual(["xyz:TSLA", "xyz:tsla", "TSLA"]);
      expect(out["xyz:TSLA"].symbol).toBe("TSLA");
      expect(out["xyz:tsla"]).toEqual(out.TSLA);
    });

    it("omits symbols absent from the report rather than emitting undefined", async () => {
      stubFile(file(["20260618|TSLA|1000|50|4000|C"]));

      const out = await new FinraProvider().getShortVolume([
        "NOPE",
        "xyz:NOPE",
        "TSLA",
      ]);

      expect(Object.keys(out)).toEqual(["TSLA"]);
      expect("NOPE" in out).toBe(false);
    });

    it("returns an empty record for an empty symbol list without skipping the load", async () => {
      const fetchMock = stubFile(file(["20260618|TSLA|1000|50|4000|C"]));

      const out = await new FinraProvider().getShortVolume([]);

      expect(out).toEqual({});
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("serves one cached report to every symbol list — a single fetch", async () => {
      const fetchMock = stubFile(
        file(["20260618|TSLA|1000|50|4000|C", "20260618|AAPL|2000|10|8000|C"]),
      );

      const first = await new FinraProvider().getShortVolume(["TSLA"]);
      // A brand-new instance shares the module-level single-slot "latest" cache.
      const second = await new FinraProvider().getShortVolume(["AAPL"]);

      expect(first.TSLA.shortVolume).toBe(1000);
      expect(second.AAPL.shortPct).toBe(25);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
