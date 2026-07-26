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
//  2. Sign handling. `formatMoneyCompact` leads with the minus, `formatMoney`
//     does not, and `formatAmount`'s branches compare the raw `value` rather
//     than its magnitude — so a negative price prints in exponential notation
//     on a card. Both are pinned below as KNOWN BUGs; they are latent today
//     only because current callers send negatives to `compact`, which handles
//     the sign itself. HAZARD for anyone reaching for `money.price()`.
//
// Pure and React-free: this file deliberately has no `@vitest-environment
// jsdom` docblock, so importing `money.ts` under the default node environment
// is itself part of what is pinned.
import { CURRENCY_CODES, type CurrencyCode } from "@zframes/spec";
import { describe, expect, it } from "vitest";
import {
  CURRENCY_SYMBOLS,
  currencySymbol,
  formatAmount,
  formatMagnitude,
  formatMoney,
  formatMoneyCompact,
} from "./money";

describe("module surface", () => {
  it("exports exactly the six money helpers, nothing more", async () => {
    const mod = await import("./money");
    expect(Object.keys(mod).sort()).toEqual([
      "CURRENCY_SYMBOLS",
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
    // Unlike formatAmount, this branches on Math.abs, so negatives scale.
    expect(formatMagnitude(-1500)).toBe("-1.5K");
    expect(formatMagnitude(-5e9)).toBe("-5.00B");
    expect(formatMagnitude(-500)).toBe("-500");
  });

  it("prints unsigned zero (negative zero is not < 0)", () => {
    expect(formatMagnitude(0)).toBe("0");
    expect(formatMagnitude(-0)).toBe("0");
  });
});

describe("formatAmount", () => {
  it("formats zero through the toPrecision(4) branch", () => {
    expect(formatAmount(0)).toBe("0.000");
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

  it("sends every negative to toPrecision(4)", () => {
    // KNOWN BUG: formatAmount branches on `value >= …` instead of the
    // magnitude, so a negative never reaches the grouping branches and a
    // millions-scale negative renders in exponential notation ("-2.160e+6")
    // — should be "-2,160,387". Pinned so the suite stays green; fixing the
    // source must flip this assertion.
    expect(formatAmount(-2160387)).toBe("-2.160e+6");
    expect(formatAmount(-20.66)).toBe("-20.66");
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

  it("puts the symbol AHEAD of the minus sign", () => {
    // KNOWN BUG: formatMoney renders "$-20.66" — should be "-$20.66", the
    // sign-first wording formatMoneyCompact already uses (and which its own
    // docblock calls "natural"). Pinned so the suite stays green; fixing the
    // source must flip this assertion.
    expect(formatMoney(-20.66, "USD")).toBe("$-20.66");
  });

  it("renders a negative millions price in exponential notation", () => {
    // KNOWN BUG: formatMoney prints "$-2.160e+6" on a card — should be
    // "-$2,160,387". Inherited from formatAmount's `value >= …` branches, and
    // reachable through `useMoney().price()`, the primitive every new frame is
    // told to use. Pinned so the suite stays green; fixing the source must
    // flip this assertion.
    expect(formatMoney(-2160387, "USD")).toBe("$-2.160e+6");
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
    // The sign is stripped here, so — unlike formatMoney — the magnitude
    // branches still apply to negatives.
    expect(formatMoneyCompact(-1500, "USD")).toBe("-$1.5K");
    expect(formatMoneyCompact(-500, "USD")).toBe("-$500");
  });

  it("treats zero as non-negative", () => {
    expect(formatMoneyCompact(0, "USD")).toBe("$0");
  });
});
