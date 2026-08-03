import { describe, expect, it } from "vitest";
import { CURRENCY_CODES, CurrencySchema, DashboardSpecSchema } from "./spec";

/**
 * `CURRENCY_CODES` is the selectable-currency enum, and it is now derived from a
 * ≥2-source coverage sweep across `provider-fx`'s keyless chain (Frankfurter/ECB
 * → FXRatesAPI → currency-api → ECB direct) rather than hand-typed off one feed.
 *
 * These tests are the guard rails that survey cannot be: they are HERMETIC (no
 * network — the live-coverage half is a scheduled monitor's job) and they pin the
 * invariants a widened list could quietly break —
 *
 *  - **No code may be dropped.** Removing an entry is a breaking spec change: a
 *    saved `dashboard.json` denominated in it stops parsing. The original 19 are
 *    therefore listed literally here, not derived, so a future sweep that loses
 *    one fails the build instead of silently invalidating boards.
 *  - **USD stays first**, because it is the canonical provider unit and the
 *    schema default.
 *  - **Nothing that isn't a currency gets in.** Metals, funds codes and crypto
 *    all appear in FX feeds with three-letter codes and would sail through a
 *    naive "≥2 sources quote it" filter.
 */

/**
 * The list as it stood before the multi-source widening. Deliberately a literal:
 * deriving it from anything would defeat the point of the test.
 */
const ORIGINAL_19 = [
  "USD",
  "THB",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "KRW",
  "SGD",
  "AUD",
  "CAD",
  "CHF",
  "INR",
  "IDR",
  "MYR",
  "PHP",
  "HKD",
  "BRL",
  "MXN",
  "ZAR",
] as const;

describe("CURRENCY_CODES", () => {
  it("still contains every one of the original 19 codes", () => {
    // Dropping one invalidates existing dashboards — see the header comment.
    const missing = ORIGINAL_19.filter(
      (code) => !(CURRENCY_CODES as readonly string[]).includes(code),
    );
    expect(missing, "codes removed from the enum (breaking change)").toEqual(
      [],
    );
  });

  it("keeps USD first — the provider unit and the schema default", () => {
    expect(CURRENCY_CODES[0]).toBe("USD");
  });

  it("has no duplicates", () => {
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
  });

  it("is entirely three uppercase ASCII letters", () => {
    const bad = CURRENCY_CODES.filter((code) => !/^[A-Z]{3}$/.test(code));
    expect(bad).toEqual([]);
  });

  it("excludes metals — they are units, not currencies", () => {
    // XAU/XAG/XPT/XPD are quoted by more than two chain sources, so coverage
    // alone would admit them. They have no ISO minor units and no `Intl`
    // currency support, and "price this board in gold ounces" is its own
    // feature — not a display currency.
    for (const metal of ["XAU", "XAG", "XPT", "XPD", "XCU"])
      expect(CURRENCY_CODES as readonly string[]).not.toContain(metal);
  });

  it("excludes funds codes and crypto — neither circulates", () => {
    for (const code of [
      "XDR", // IMF special drawing rights
      "XUA",
      "XSU",
      "XXX", // "no currency"
      "XTS", // reserved for testing
      "BTC",
      "ETH",
      "XBT",
      "USDT",
      "USDC",
      "SOL",
    ])
      expect(CURRENCY_CODES as readonly string[]).not.toContain(code);
  });

  it("excludes withdrawn codes — they name currencies that no longer exist", () => {
    // Each of these is still carried by ≥2 chain sources (and some by `Intl`),
    // but ISO-4217 has withdrawn it or its issuer moved on.
    for (const code of [
      "HRK", // Croatia adopted the euro 2023-01-01
      "CUC", // abolished 2021
      "SLL", // redenominated to SLE 2022
      "ZWL", // superseded by ZWG 2024
      "ANG", // superseded by XCG 2025-03-31
      "VEF", // superseded by VES
      "MRO", // superseded by MRU
      "STD", // superseded by STN
      "LTL",
      "LVL",
      "EEK",
      "CYP", // pre-euro national currencies
    ])
      expect(CURRENCY_CODES as readonly string[]).not.toContain(code);
  });

  it("keeps the real X-prefixed currencies — the metals filter must not be a blanket /^X/", () => {
    // XAF/XOF (CFA francs), XPF (CFP franc) and XCD (East Caribbean dollar) are
    // circulating currencies of ~20 countries between them. A naive "drop
    // anything starting with X" rule would silently un-support all of them.
    for (const code of ["XAF", "XOF", "XPF", "XCD"])
      expect(CURRENCY_CODES as readonly string[]).toContain(code);
  });

  it("is materially wider than the single-source list it replaced", () => {
    // Not an exact count (the sweep re-runs as coverage drifts), just the floor
    // that proves the widening landed rather than a hand-tweak of the old 19.
    expect(CURRENCY_CODES.length).toBeGreaterThan(100);
  });
});

/** A one-frame spec skeleton; `title` + `frames` are the only required fields. */
const base = { title: "t", frames: [] };

describe("both currency enums accept the widened list", () => {
  it("the board-wide CurrencySchema takes a newly added code", () => {
    // VND was NOT in the original 19 — it is only selectable because the sweep
    // found ≥2 chain sources quoting it.
    expect(CurrencySchema.parse({ code: "VND" }).code).toBe("VND");
    expect(
      DashboardSpecSchema.parse({ ...base, currency: { code: "VND" } }).currency
        .code,
    ).toBe("VND");
  });

  it("the per-card override takes a newly added code", () => {
    const parsed = DashboardSpecSchema.parse({
      ...base,
      currency: { code: "THB" },
      frames: [
        {
          id: "a",
          frame: "note",
          position: { x: 0, y: 0, w: 4, h: 3 },
          currency: "VND",
          config: {},
        },
      ],
    });
    expect(parsed.frames[0].currency).toBe("VND");
  });

  it("still rejects a bogus code at both levels", () => {
    for (const code of ["ZZZ", "XAU", "BTC", "usd", "US", "USDD"]) {
      expect(
        CurrencySchema.safeParse({ code }).success,
        `board-level ${code} should be rejected`,
      ).toBe(false);
      expect(
        DashboardSpecSchema.safeParse({
          ...base,
          frames: [
            {
              id: "a",
              frame: "note",
              position: { x: 0, y: 0, w: 4, h: 3 },
              currency: code,
              config: {},
            },
          ],
        }).success,
        `per-card ${code} should be rejected`,
      ).toBe(false);
    }
  });

  it("defaults the board to USD when currency is omitted", () => {
    expect(DashboardSpecSchema.parse(base).currency.code).toBe("USD");
  });
});
