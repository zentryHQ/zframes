const TRILLION = 1_000_000_000_000;
const BILLION = 1_000_000_000;
const MILLION = 1_000_000;

export const parseMarketData = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  if (value === 0) return "0";
  if (value < 0.001) {
    return formatSmallNumber(value);
  }
  if (value < 1) {
    return parseFloat(value.toPrecision(4)).toString();
  }
  if (value < 10) {
    return parseFloat(value.toPrecision(4)).toString();
  }
  if (value < MILLION) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  if (value > TRILLION) {
    return `${(value / TRILLION).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}T`;
  }
  if (value > BILLION) {
    return `${(value / BILLION).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}B`;
  }
  if (value > MILLION) {
    return `${(value / MILLION).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}M`;
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

/**
 * A bare reading, for a chart that has to print a number its caller gave it no
 * formatter for (the gauge's hover tooltip). Enough precision to be honest,
 * never enough to expose float noise: a put/call ratio that reads 1.04 in the
 * centre of the dial must not appear as 1.0400000000000002 in the tooltip
 * beside it.
 *
 * Deliberately NOT `parseMarketData`: a gauge's bounds are ratios and index
 * levels, not market caps, so compacting 1,200 to "1.20K" would be worse than
 * printing it.
 */
export const formatReading = (value: number): string => {
  // A gauge whose value never arrived would otherwise print "NaN" / "Infinity"
  // as though it were a reading.
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  const text =
    // Below a hundredth, two decimals would round the whole reading away
    // (0.0001 → "0"), so keep four significant digits there instead.
    magnitude > 0 && magnitude < 0.01
      ? String(parseFloat(value.toPrecision(4)))
      : // Trailing zeros trimmed, so a whole 100 does not read "100.00".
        value.toFixed(2).replace(/\.?0+$/, "");
  // A negative zero would print "-0", which reads as a signed reading.
  return text === "-0" ? "0" : text;
};

const toSubscript = (num: number): string => {
  const subscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
  return num
    .toString()
    .split("")
    .map((digit) => subscripts[parseInt(digit)])
    .join("");
};

/** Format small numbers with subscript notation (e.g., 0.₄823 for 0.0000823) */
export const formatSmallNumber = (value: number): string => {
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  const str = absValue.toFixed(20).replace(/\.?0+$/, "");
  const match = str.match(/^0\.0+/);

  if (match) {
    const leadingZeros = match[0].length - 2;
    const significantPart = str.slice(match[0].length);
    const digits = significantPart.slice(0, 3).replace(/0+$/, "");
    const formatted = `0.${toSubscript(leadingZeros)}${digits}`;
    return isNegative ? `-${formatted}` : formatted;
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Math.round(value * 100) / 100);
};
