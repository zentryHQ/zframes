// The money-formatting kernel's contract. `money.ts` is the ONE place that
// decides how an amount of money is rendered: `@zframes/frames`'s
// `formatPrice`/`formatCompactUsd` delegate here, and `useMoney()` — the
// primitive every currency-aware frame is told to use — routes its
// `price`/`compact`/`magnitude` straight through these functions. A dollar
// board and a baht board can only agree because this rounding lives once.
//
// Before this file only the USD path was pinned, and only indirectly (through
// `packages/frames/src/format.test.ts`), which left two things unguarded:
//
//  1. The symbol table. Ambiguous glyphs are disambiguated on purpose — CNY is
//     "CN¥" and not "¥", HKD/SGD/AUD/CAD/MXN/BRL carry a country letter, and
//     CHF is a code with a deliberate TRAILING SPACE — because a per-card
//     `currency` override can put two currencies side by side on one board. A
//     "tidy-up" of the table would mislabel amounts with nothing failing.
//
//  2. Sign handling. Every formatter now bands on the MAGNITUDE and prefixes
//     the sign, so `-$20.66` and `-$2,160,387` read the same way through
//     `price` as through `compact`. Both used to be wrong the other way —
//     `formatMoney` glued the sign after the symbol and `formatAmount`
//     compared the signed value, dropping every negative into exponential
//     notation — so the assertions below are the regression net for the fix,
//     not a description of the current behaviour's history.
//
//  3. Values that are not numbers. NaN and ±Infinity reach these formatters
//     from any upstream division by zero, and used to print "NaN", "$NaN" and
//     "InfinityT". They render the em-dash placeholder instead.
//
// Pure and React-free: this file deliberately has no `@vitest-environment
// jsdom` docblock, so importing `money.ts` under the default node environment
// is itself part of what is pinned.
import { CURRENCY_CODES, type CurrencyCode } from "@zframes/spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CURRENCY_SYMBOLS,
  currencyDigits,
  currencySymbol,
  formatAmount,
  formatMagnitude,
  formatMoney,
  formatMoneyCompact,
} from "./money";

describe("module surface", () => {
  it("exports exactly the seven money helpers, nothing more", async () => {
    const mod = await import("./money");
    expect(Object.keys(mod).sort()).toEqual([
      "CURRENCY_SYMBOLS",
      "currencyDigits",
      "currencySymbol",
      "formatAmount",
      "formatMagnitude",
      "formatMoney",
      "formatMoneyCompact",
    ]);
  });
});

describe("CURRENCY_SYMBOLS", () => {
  it("carries a symbol for every code the spec allows", () => {
    // A code added to CURRENCY_CODES without a symbol here would render as a
    // bare "$" via the fallback, i.e. a baht figure wearing a dollar sign.
    expect(Object.keys(CURRENCY_SYMBOLS).sort()).toEqual(
      [...CURRENCY_CODES].sort(),
    );
  });

  it("disambiguates glyphs that several currencies share", () => {
    // The whole point of the table: these are NOT the naive one-glyph forms.
    expect(CURRENCY_SYMBOLS.CNY).toBe("CN¥");
    expect(CURRENCY_SYMBOLS.JPY).toBe("¥");
    expect(CURRENCY_SYMBOLS.HKD).toBe("HK$");
    expect(CURRENCY_SYMBOLS.SGD).toBe("S$");
    expect(CURRENCY_SYMBOLS.AUD).toBe("A$");
    expect(CURRENCY_SYMBOLS.CAD).toBe("C$");
    expect(CURRENCY_SYMBOLS.MXN).toBe("MX$");
    expect(CURRENCY_SYMBOLS.USD).toBe("$");
    expect(CURRENCY_SYMBOLS.BRL).toBe("R$");
    expect(CURRENCY_SYMBOLS.ZAR).toBe("R");
    expect(CURRENCY_SYMBOLS.THB).toBe("฿");
  });
});

// The exact symbol every code shipped with when the table was hand-written.
// The table is now DERIVED from `Intl.NumberFormat`, so this is the regression
// net for that swap: not one of these strings may move, because each is what is
// already printed on somebody's board. `en-US` Intl reproduces most of them
// (including "CN¥", "A$", "HK$", "MX$", "R$"); the rest come from the small
// `SYMBOL_OVERRIDES` map, and CHF's trailing space from the "a code-shaped
// symbol needs a separator" rule.
const SHIPPED_SYMBOLS: Record<string, string> = {
  USD: "$",
  THB: "฿",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "CN¥",
  KRW: "₩",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF ",
  INR: "₹",
  IDR: "Rp",
  MYR: "RM",
  PHP: "₱",
  HKD: "HK$",
  BRL: "R$",
  MXN: "MX$",
  ZAR: "R",
};

describe("Intl-derived symbols preserve every shipped glyph", () => {
  for (const [code, symbol] of Object.entries(SHIPPED_SYMBOLS)) {
    it(`renders ${code} as ${JSON.stringify(symbol)}`, () => {
      expect(currencySymbol(code as CurrencyCode)).toBe(symbol);
      expect(CURRENCY_SYMBOLS[code as CurrencyCode]).toBe(symbol);
    });
  }
});

describe("currencyDigits", () => {
  it("gives zero minor units to the currencies that have none", () => {
    // A yen/won/dong price with a ".00" on it is not a price anyone quotes.
    // IDR is an override: CLDR reports 2 for the rupiah, market data quotes 0.
    for (const code of ["JPY", "KRW", "VND", "IDR"]) {
      expect(currencyDigits(code as CurrencyCode)).toBe(0);
    }
  });

  it("gives three minor units to the Gulf dinars", () => {
    for (const code of ["KWD", "BHD", "OMR", "JOD", "TND"]) {
      expect(currencyDigits(code as CurrencyCode)).toBe(3);
    }
  });

  it("leaves the ordinary currencies at two", () => {
    for (const code of ["USD", "EUR", "GBP", "THB", "CHF", "INR"]) {
      expect(currencyDigits(code as CurrencyCode)).toBe(2);
    }
  });

  it("degrades to two for a code Intl cannot resolve", () => {
    expect(currencyDigits("not a code!" as unknown as CurrencyCode)).toBe(2);
  });
});

describe("minor units in the unit-scale band", () => {
  it("drops the fake decimals from a zero-minor-unit price", () => {
    expect(formatMoney(123.456, "JPY")).toBe("¥123");
    expect(formatMoney(694.5, "KRW")).toBe("₩695");
    expect(formatAmount(123.456, "JPY")).toBe("123");
  });

  it("keeps the third digit of a three-minor-unit price", () => {
    expect(formatMoney(20.665, "KWD" as CurrencyCode)).toBe("KWD 20.665");
    expect(formatAmount(20.665, "BHD" as CurrencyCode)).toBe("20.665");
  });

  it("leaves two-minor-unit currencies exactly as before", () => {
    expect(formatMoney(20.665, "USD")).toBe("$20.67");
    expect(formatAmount(20.665)).toBe("20.67");
    expect(formatAmount(20.665, "THB")).toBe("20.67");
  });

  it("does not touch the bands above 1,000 or below 1", () => {
    // Above 1,000 every currency already rounds to whole units; below 1 the
    // four-significant-digit floor is what makes a sub-unit price legible, so a
    // zero-minor-unit currency must NOT collapse it to "1".
    expect(formatMoney(1234.56, "JPY")).toBe("¥1,235");
    expect(formatMoney(1234.56, "USD")).toBe("$1,235");
    expect(formatAmount(0.6145, "JPY")).toBe("0.6145");
    expect(formatAmount(0.6145, "KWD" as CurrencyCode)).toBe("0.6145");
  });

  it("keeps formatMagnitude and the compact path currency-blind", () => {
    // A scale, not a price: "1.23T" must read identically in every currency.
    expect(formatMagnitude(1.23e12)).toBe("1.23T");
    expect(formatMoneyCompact(1.23e9, "JPY")).toBe("¥1.23B");
    expect(formatMoneyCompact(1.23e9, "KWD" as CurrencyCode)).toBe("KWD 1.23B");
  });
});

describe("currencySymbol", () => {
  it("returns the CHF code with its trailing space", () => {
    // The space is load-bearing: it is what separates "CHF" from the digits
    // when formatMoney concatenates symbol + amount.
    expect(currencySymbol("CHF")).toBe("CHF ");
  });

  it("returns the disambiguated glyph, not the shared one", () => {
    expect(currencySymbol("CNY")).toBe("CN¥");
    expect(currencySymbol("HKD")).toBe("HK$");
  });

  it("falls back to the dollar sign for a code outside the table", () => {
    // Reachable at runtime from a hand-edited dashboard.json that predates a
    // code being removed from the enum.
    expect(currencySymbol("XXX" as unknown as CurrencyCode)).toBe("$");
  });
});

describe("formatMagnitude", () => {
  it("switches to trillions at exactly 1e12, two decimals", () => {
    expect(formatMagnitude(1e12)).toBe("1.00T");
  });

  it("switches to billions at exactly 1e9, two decimals", () => {
    expect(formatMagnitude(1e9)).toBe("1.00B");
  });

  it("switches to millions at exactly 1e6, two decimals", () => {
    expect(formatMagnitude(1e6)).toBe("1.00M");
  });

  it("uses ONE decimal for thousands, at exactly 1e3", () => {
    expect(formatMagnitude(1e3)).toBe("1.0K");
  });

  it("prints a bare integer just under the thousands cutoff", () => {
    expect(formatMagnitude(999)).toBe("999");
    expect(formatMagnitude(999.4)).toBe("999");
  });

  it("keeps the sign in front for negatives at every scale", () => {
    expect(formatMagnitude(-1500)).toBe("-1.5K");
    expect(formatMagnitude(-5e9)).toBe("-5.00B");
    expect(formatMagnitude(-500)).toBe("-500");
  });

  it("prints unsigned zero (negative zero is not < 0)", () => {
    expect(formatMagnitude(0)).toBe("0");
    expect(formatMagnitude(-0)).toBe("0");
  });

  it("keeps a sub-unit magnitude instead of rounding it away", () => {
    // A magnitude below 1 used to round to whole units, so the figure "0.4"
    // rendered as "0" — the reading, deleted. Two significant digits keep it.
    expect(formatMagnitude(0.4)).toBe("0.40");
    expect(formatMagnitude(0.96)).toBe("0.96");
    expect(formatMagnitude(-0.4)).toBe("-0.40");
    // Zero is not sub-unit and keeps its bare form (no "0.00" on a scale).
    expect(formatMagnitude(0)).toBe("0");
  });

  it("switches to quadrillions at exactly 1e15 rather than counting zeros", () => {
    // With trillions as the top band this printed "1000.00T".
    expect(formatMagnitude(1e15)).toBe("1.00Q");
    expect(formatMagnitude(1.23e15)).toBe("1.23Q");
    expect(formatMagnitude(-1e15)).toBe("-1.00Q");
    // The band below is untouched: 999 trillion still reads in T.
    expect(formatMagnitude(9.99e14)).toBe("999.00T");
  });

  it("renders the em-dash placeholder for a value that is not a number", () => {
    // A division by zero upstream must not print a confident "NaN"/"InfinityT".
    expect(formatMagnitude(NaN)).toBe("—");
    expect(formatMagnitude(Infinity)).toBe("—");
    expect(formatMagnitude(-Infinity)).toBe("—");
  });
});

describe("formatAmount", () => {
  it("gives zero the currency's own minor units, not four significant digits", () => {
    // Zero used to fall into the sub-unit band and print "0.000" — three
    // decimals no currency asked for.
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(0, "JPY")).toBe("0");
    expect(formatAmount(0, "KWD" as CurrencyCode)).toBe("0.000");
    // Negative zero is still zero, and never wears a minus.
    expect(formatAmount(-0)).toBe("0.00");
  });

  it("keeps four significant digits below 1", () => {
    expect(formatAmount(0.6145)).toBe("0.6145");
    expect(formatAmount(0.5)).toBe("0.5000");
  });

  it("drops fractional zeros at exactly 1 (the >=1 branch)", () => {
    expect(formatAmount(1)).toBe("1");
  });

  it("keeps two decimals just under the thousands cutoff", () => {
    expect(formatAmount(999.99)).toBe("999.99");
  });

  it("switches to grouped integers at exactly 1000", () => {
    expect(formatAmount(1000)).toBe("1,000");
  });

  it("rounds to a whole unit in the thousands branch", () => {
    expect(formatAmount(1234.56)).toBe("1,235");
  });

  it("groups a millions-scale price with no decimals", () => {
    expect(formatAmount(2160387)).toBe("2,160,387");
  });

  it("bands a negative by its magnitude, so it groups like its positive", () => {
    // Branching on the signed value sent every negative past both grouping
    // branches into toPrecision(4): a millions-scale negative rendered in
    // exponential notation ("-2.160e+6").
    expect(formatAmount(-2160387)).toBe("-2,160,387");
    expect(formatAmount(-20.66)).toBe("-20.66");
    expect(formatAmount(-1000)).toBe("-1,000");
    expect(formatAmount(-1234.56)).toBe("-1,235");
    // The sub-unit band keeps its four significant digits, sign in front.
    expect(formatAmount(-0.6145)).toBe("-0.6145");
    // Mirror image of the positive in every band.
    for (const value of [2160387, 1000, 1234.56, 20.66, 0.6145]) {
      expect(formatAmount(-value)).toBe(`-${formatAmount(value)}`);
    }
  });

  it("renders the em-dash placeholder for a value that is not a number", () => {
    expect(formatAmount(NaN)).toBe("—");
    expect(formatAmount(Infinity)).toBe("—");
    expect(formatAmount(-Infinity)).toBe("—");
  });
});

describe("formatMoney", () => {
  it("prefixes the plain dollar sign for USD", () => {
    expect(formatMoney(20.66, "USD")).toBe("$20.66");
  });

  it("keeps the CHF trailing space as the code/amount separator", () => {
    expect(formatMoney(20.66, "CHF")).toBe("CHF 20.66");
  });

  it("groups a large amount behind a single-glyph symbol", () => {
    expect(formatMoney(2160387, "THB")).toBe("฿2,160,387");
  });

  it("uses the disambiguated symbol for a shared glyph", () => {
    expect(formatMoney(20.66, "CNY")).toBe("CN¥20.66");
    expect(formatMoney(20.66, "HKD")).toBe("HK$20.66");
  });

  it("puts the minus AHEAD of the symbol", () => {
    // "-$20.66", never "$-20.66": the sign-first wording formatMoneyCompact
    // already used (and which its own docblock calls "natural").
    expect(formatMoney(-20.66, "USD")).toBe("-$20.66");
    // Multi-character symbols keep their separator inside the amount.
    expect(formatMoney(-20.66, "CHF")).toBe("-CHF 20.66");
    expect(formatMoney(-20.66, "THB")).toBe("-฿20.66");
  });

  it("groups a negative millions price instead of going exponential", () => {
    // Inherited from formatAmount's signed branches, and reachable through
    // `useMoney().price()` — the primitive every new frame is told to use.
    expect(formatMoney(-2160387, "USD")).toBe("-$2,160,387");
  });

  it("prints zero at the currency's minor units", () => {
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(0, "JPY")).toBe("¥0");
  });

  it("renders the em-dash placeholder for a value that is not a number", () => {
    // Never "$NaN": the symbol must not vouch for a non-number.
    expect(formatMoney(NaN, "USD")).toBe("—");
    expect(formatMoney(Infinity, "THB")).toBe("—");
    expect(formatMoney(-Infinity, "USD")).toBe("—");
  });
});

describe("formatMoneyCompact", () => {
  it("prefixes the symbol for a positive aggregate", () => {
    expect(formatMoneyCompact(1.23e9, "USD")).toBe("$1.23B");
  });

  it("keeps the CHF trailing space on a positive aggregate", () => {
    expect(formatMoneyCompact(5e9, "CHF")).toBe("CHF 5.00B");
  });

  it("puts the minus BEFORE a single-glyph symbol", () => {
    expect(formatMoneyCompact(-5e9, "THB")).toBe("-฿5.00B");
  });

  it("puts the minus BEFORE a multi-character symbol", () => {
    // "-CHF 5.00B", never "CHF -5.00B" and never "-CHF5.00B".
    expect(formatMoneyCompact(-5e9, "CHF")).toBe("-CHF 5.00B");
  });

  it("scales a negative correctly (it negates before formatting)", () => {
    expect(formatMoneyCompact(-1500, "USD")).toBe("-$1.5K");
    expect(formatMoneyCompact(-500, "USD")).toBe("-$500");
  });

  it("treats zero as non-negative", () => {
    expect(formatMoneyCompact(0, "USD")).toBe("$0");
  });

  it("renders the em-dash placeholder for a value that is not a number", () => {
    // The guard is on this path too, or the symbol would be glued to the
    // placeholder ("$—").
    expect(formatMoneyCompact(NaN, "USD")).toBe("—");
    expect(formatMoneyCompact(Infinity, "USD")).toBe("—");
    expect(formatMoneyCompact(-Infinity, "CHF")).toBe("—");
  });
});

describe("Intl formatter memoization", () => {
  const RealNumberFormat = Intl.NumberFormat;

  afterEach(() => {
    Intl.NumberFormat = RealNumberFormat;
    vi.resetModules();
  });

  /**
   * Counts currency-formatter constructions while still building real
   * formatters. The module registry is reset first: the memo is module state, so
   * the copy this file imported at the top already has a warm cache and would
   * report zero constructions for any code.
   */
  function countConstructions() {
    vi.resetModules();
    const calls: string[] = [];
    class Counting extends RealNumberFormat {
      constructor(
        locales?: string | string[],
        options?: Intl.NumberFormatOptions,
      ) {
        // Recorded BEFORE super, so a code that makes the constructor throw
        // still counts as an attempt.
        if (options?.style === "currency") calls.push(String(options.currency));
        super(locales, options);
      }
    }
    Intl.NumberFormat = Counting as unknown as typeof Intl.NumberFormat;
    return calls;
  }

  it("builds one formatter per code, however many times it is asked", async () => {
    // This runs on every money figure of every card on every render, and
    // constructing an Intl.NumberFormat is the expensive part — a formatter per
    // call would be a per-frame tax paid forever.
    const calls = countConstructions();
    const { currencySymbol: sym, currencyDigits: digits } =
      await import("./money");

    for (let i = 0; i < 50; i++) {
      sym("THB");
      digits("THB");
      sym("JPY");
    }

    expect(calls).toEqual(["THB", "JPY"]);
  });

  it("caches the degraded result too, so a bad code cannot thrash", async () => {
    const calls = countConstructions();
    const { currencySymbol: sym } = await import("./money");

    const bad = "not a code!" as unknown as CurrencyCode;
    expect(sym(bad)).toBe("$");
    expect(sym(bad)).toBe("$");
    // One attempt only: the RangeError path is memoized like any other.
    expect(calls).toEqual(["not a code!"]);
  });

  it("builds nothing for a code nobody asks about", async () => {
    // CURRENCY_SYMBOLS is a table of lazy getters over the same memo, so
    // importing the module must not resolve ~150 currencies up front.
    const calls = countConstructions();
    const mod = await import("./money");
    expect(Object.keys(mod.CURRENCY_SYMBOLS).length).toBeGreaterThan(10);
    expect(calls).toEqual([]);
  });
});
