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
