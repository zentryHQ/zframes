import { describe, expect, it } from "vitest";
import { monthlyPayment } from "./mortgage-payment";

// What this file pins, and why it matters:
//
// This is the only real arithmetic in the FRED/Zillow/FHFA frame set, and it is
// the kind that fails SILENTLY: an amortising payment is a plausible-looking
// number at almost any magnitude, so mixing up the monthly-rate conversion
// (annual/12 vs annual), the sign of the exponent, or the term in years vs
// months yields a figure nobody eyeballing the card would question. The anchor
// below is therefore an external one — $200,000 at 6% over 30 years is the
// textbook $1,199.10 quoted by every mortgage table — rather than a number
// produced by this same function.
//
// Also pinned: the r = 0 branch (the closed form divides by zero there, and a
// rate series can legitimately print 0 in a stub or a mock), monotonicity in
// both rate and term, and the degenerate n <= 0 guard.

describe("monthlyPayment", () => {
  it("matches the textbook figure for $200k at 6% over 30 years", () => {
    // The standard reference every mortgage table agrees on: $1,199.10.
    expect(monthlyPayment(200_000, 6, 30)).toBeCloseTo(1199.1, 1);
  });

  it("prices a realistic board case — $400k at the 6.66% benchmark", () => {
    expect(monthlyPayment(400_000, 6.66, 30)).toBeCloseTo(2570.51, 2);
  });

  it("converts the annual rate to a MONTHLY one", () => {
    // Using the annual rate as the monthly rate would give a wildly larger
    // payment; this asserts the /12 is present by pinning the exact value.
    expect(monthlyPayment(500_000, 3, 30)).toBeCloseTo(2108.02, 2);
    // And sanity: the payment is a small fraction of the loan, not a multiple.
    expect(monthlyPayment(500_000, 3, 30)).toBeLessThan(500_000 / 100);
  });

  it("falls back to straight-line repayment at a zero rate", () => {
    // The closed form divides by zero at r = 0; the limit is loan / n.
    expect(monthlyPayment(400_000, 0, 30)).toBeCloseTo(400_000 / 360, 6);
  });

  it("treats a negative rate as the zero-rate case rather than exploding", () => {
    expect(monthlyPayment(360_000, -1, 30)).toBeCloseTo(1000, 6);
  });

  it("rises with the rate and falls with the term", () => {
    const base = monthlyPayment(400_000, 6, 30);
    expect(monthlyPayment(400_000, 7, 30)).toBeGreaterThan(base);
    // A shorter term repays the same principal faster, so each payment is bigger.
    expect(monthlyPayment(400_000, 6, 15)).toBeGreaterThan(base);
    expect(monthlyPayment(400_000, 6, 40)).toBeLessThan(base);
  });

  it("scales linearly with the loan amount", () => {
    expect(monthlyPayment(800_000, 6.66, 30)).toBeCloseTo(
      2 * monthlyPayment(400_000, 6.66, 30),
      6,
    );
  });

  it("is zero for a zero loan, and for a non-positive term", () => {
    expect(monthlyPayment(0, 6.66, 30)).toBe(0);
    expect(monthlyPayment(400_000, 6.66, 0)).toBe(0);
  });

  it("always repays more than the principal at a positive rate", () => {
    // Total paid over the schedule must exceed the loan — otherwise the interest
    // term has the wrong sign.
    const payment = monthlyPayment(400_000, 6.66, 30);
    expect(payment * 360).toBeGreaterThan(400_000);
  });
});
