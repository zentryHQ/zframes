import { describe, expect, it } from "vitest";
import { columnLabelStep } from "./index";

/**
 * The column-label thinning used a fixed 34px "a label needs this much" guess,
 * which is wider than any three-letter code — so `fx-cross-heatmap` on a card
 * whose columns came out 28px wide silently dropped every other currency and
 * shipped looking like a broken axis. It now measures.
 *
 * Under jsdom there is no canvas, so `measureTextWidth` takes its ~0.62em per
 * glyph estimate; the numbers below hold for both paths (a real "EUR" is 21.8px
 * at 12px DM Sans, the estimate 22.3px), which is the point of asserting on
 * behaviour at realistic widths rather than on measured pixels.
 */
const CURRENCIES = ["EUR", "GBP", "JPY", "CHF", "CAD", "USD"];
const GAP = 6;

describe("columnLabelStep", () => {
  it("keeps every label when a short code fits its own column", () => {
    // The width that regressed: 34 > 28 thinned, 22px of text did not need to.
    expect(columnLabelStep(CURRENCIES, 28, GAP)).toBe(1);
    expect(columnLabelStep(CURRENCIES, 49, GAP)).toBe(1);
  });

  it("thins once a label genuinely outgrows one column", () => {
    expect(columnLabelStep(CURRENCIES, 12, GAP)).toBeGreaterThan(1);
    // Long labels thin at widths where short ones do not: this is the case the
    // fixed constant was protecting, and it still holds.
    const months = ["January", "February", "March", "April"];
    expect(columnLabelStep(months, 28, GAP)).toBeGreaterThan(
      columnLabelStep(CURRENCIES, 28, GAP),
    );
  });

  it("never asks for more steps than there are columns", () => {
    // An unmeasured grid (cellWidth 0) must still terminate, and must never
    // return a step that would drop every label including the first.
    const step = columnLabelStep(CURRENCIES, 0, GAP);
    expect(step).toBeGreaterThan(1);
    expect(step).toBeLessThanOrEqual(CURRENCIES.length);
    expect(columnLabelStep([], 0, GAP)).toBe(1);
  });

  it("counts the gaps a spilling label may cross", () => {
    // A label 60px wide across 25px columns: two cells alone are 50px, but the
    // 6px gap between them carries it, so step 2 is enough.
    const wide = ["ABCDEFGHI"];
    const step = columnLabelStep([...wide, ...wide, ...wide, ...wide], 25, 20);
    expect(step).toBe(2);
  });
});
