import { describe, expect, it } from "vitest";
import { formatReading } from "./format";

// The default a chart falls back to when its caller passed no formatter. Its
// whole job is to not leak float noise or a non-number into a readout, so the
// cases worth pinning are the ones a naive `String(v)` gets wrong.

describe("formatReading", () => {
  it("hides float noise behind two decimals", () => {
    // Computed, not written as a literal: the noisy double the put/call gauge
    // actually produced, which no decimal literal can spell without lint
    // flagging the precision loss.
    expect(formatReading(1.04 + Number.EPSILON)).toBe("1.04");
    expect(formatReading(0.30000000000000004)).toBe("0.3");
  });

  it("keeps whole numbers whole", () => {
    expect(formatReading(100)).toBe("100");
    expect(formatReading(0)).toBe("0");
    expect(formatReading(-0)).toBe("0");
    expect(formatReading(1200)).toBe("1200");
  });

  it("trims trailing zeros instead of padding to two decimals", () => {
    expect(formatReading(0.4)).toBe("0.4");
    expect(formatReading(2.5)).toBe("2.5");
  });

  it("keeps a sub-hundredth reading rather than rounding it away", () => {
    // Two decimals would print "0" for both, i.e. lose the reading entirely.
    expect(formatReading(0.0001)).toBe("0.0001");
    expect(formatReading(-0.0025)).toBe("-0.0025");
  });

  it("renders a non-number as the absent-value dash, never as NaN", () => {
    expect(formatReading(Number.NaN)).toBe("—");
    expect(formatReading(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatReading(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("keeps the sign of a real negative reading", () => {
    expect(formatReading(-1.239)).toBe("-1.24");
  });
});
