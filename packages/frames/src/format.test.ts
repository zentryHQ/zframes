import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeColor,
  DOWN_COLOR,
  DOWN_COLOR_HEX,
  formatBtc,
  formatChangePct,
  formatCompact,
  formatCompactUsd,
  formatFundingPct,
  formatHashrate,
  formatPct,
  formatPrice,
  formatRate,
  prettySlug,
  timeAgo,
  UP_COLOR,
  UP_COLOR_HEX,
} from "./format";

describe("formatPrice", () => {
  it("uses 4-significant-digit precision below $1 (zero branch)", () => {
    // value < 1 → toPrecision(4); 0 formats as "0.000".
    expect(formatPrice(0)).toBe("$0.000");
  });

  it("uses toPrecision(4) for a sub-dollar fraction", () => {
    expect(formatPrice(0.5)).toBe("$0.5000");
  });

  it("drops fractional zeros at exactly $1 (the >=1 branch)", () => {
    // >=1 → maximumFractionDigits: 2, so a whole dollar has no decimals.
    expect(formatPrice(1)).toBe("$1");
  });

  it("keeps two decimals just under the thousands cutoff", () => {
    expect(formatPrice(999.99)).toBe("$999.99");
  });

  it("switches to integer + grouping at exactly $1000", () => {
    expect(formatPrice(1000)).toBe("$1,000");
  });

  it("groups a million with no decimals", () => {
    expect(formatPrice(1e6)).toBe("$1,000,000");
  });

  it("rounds to whole dollars in the thousands branch", () => {
    expect(formatPrice(1234.56)).toBe("$1,235");
  });
});

describe("formatChangePct", () => {
  it("prefixes a plus sign for a positive delta", () => {
    expect(formatChangePct(1.234)).toBe("+1.23%");
  });

  it("treats exactly zero as non-negative (gets a plus)", () => {
    expect(formatChangePct(0)).toBe("+0.00%");
  });

  it("keeps the native minus for a negative delta and no extra sign", () => {
    expect(formatChangePct(-2.5)).toBe("-2.50%");
  });
});

describe("formatRate", () => {
  it("uses 4 decimals below 100", () => {
    expect(formatRate(0.8776)).toBe("0.8776");
  });

  it("switches to 2 decimals at exactly 100", () => {
    expect(formatRate(100)).toBe("100.00");
  });

  it("uses 2 decimals and grouping above 100", () => {
    expect(formatRate(162.44)).toBe("162.44");
  });

  it("pads a short fraction to the fixed precision below 100", () => {
    expect(formatRate(1.5)).toBe("1.5000");
  });
});

describe("formatPct", () => {
  it("appends a percent sign at the default 2dp", () => {
    expect(formatPct(3.42)).toBe("3.42%");
  });

  it("honours a custom decimal count", () => {
    expect(formatPct(3.4, 0)).toBe("3%");
  });

  it("does not force a sign for a level value", () => {
    // formatPct is for unsigned levels — negatives keep only the native minus.
    expect(formatPct(-1.2)).toBe("-1.20%");
  });
});

describe("formatFundingPct", () => {
  it("signs a positive funding rate at 4dp", () => {
    expect(formatFundingPct(0.0125)).toBe("+0.0125%");
  });

  it("signs zero as positive", () => {
    expect(formatFundingPct(0)).toBe("+0.0000%");
  });

  it("keeps the native minus for a negative funding rate", () => {
    expect(formatFundingPct(-0.003)).toBe("-0.0030%");
  });
});

describe("changeColor and the semantic color tokens", () => {
  it("resolves gain/loss through CSS vars, not literal hex", () => {
    // Load-bearing: these MUST be var() tokens so a custom upColor/downColor
    // on the dashboard container still recolours gain/loss.
    expect(UP_COLOR).toBe("var(--zf-up, #3fd08f)");
    expect(DOWN_COLOR).toBe("var(--zf-down, #ff6b81)");
    expect(UP_COLOR).toContain("var(--zf-up");
    expect(DOWN_COLOR).toContain("var(--zf-down");
  });

  it("exposes the default hex for canvas/D3 consumers (not a var)", () => {
    expect(UP_COLOR_HEX).toBe("#3fd08f");
    expect(DOWN_COLOR_HEX).toBe("#ff6b81");
  });

  it("picks the up var() token for a non-negative change", () => {
    expect(changeColor(1)).toBe(UP_COLOR);
    expect(changeColor(1)).toBe("var(--zf-up, #3fd08f)");
  });

  it("treats exactly zero as up", () => {
    expect(changeColor(0)).toBe(UP_COLOR);
  });

  it("picks the down var() token for a negative change", () => {
    expect(changeColor(-0.01)).toBe(DOWN_COLOR);
    expect(changeColor(-0.01)).toBe("var(--zf-down, #ff6b81)");
  });
});

describe("formatCompact", () => {
  it("formats zero with no suffix and no decimals", () => {
    expect(formatCompact(0)).toBe("0");
  });

  it("keeps hundreds as a bare rounded integer (below the K cutoff)", () => {
    expect(formatCompact(950)).toBe("950");
  });

  it("rounds the sub-K integer branch", () => {
    expect(formatCompact(950.7)).toBe("951");
  });

  it("switches to K at exactly 1e3 with one decimal", () => {
    expect(formatCompact(1e3)).toBe("1.0K");
  });

  it("formats mid-thousands as K", () => {
    expect(formatCompact(12300)).toBe("12.3K");
  });

  it("switches to M at exactly 1e6 with two decimals", () => {
    expect(formatCompact(1e6)).toBe("1.00M");
  });

  it("formats hundreds of millions", () => {
    expect(formatCompact(340e6)).toBe("340.00M");
  });

  it("switches to B at exactly 1e9", () => {
    expect(formatCompact(1e9)).toBe("1.00B");
  });

  it("switches to T at exactly 1e12", () => {
    expect(formatCompact(1e12)).toBe("1.00T");
  });

  it("formats trillions with two decimals", () => {
    expect(formatCompact(1.23e12)).toBe("1.23T");
  });

  it("leads a negative K value with a minus before the digits", () => {
    expect(formatCompact(-12300)).toBe("-12.3K");
  });

  it("leads a negative billion with a minus", () => {
    expect(formatCompact(-5e9)).toBe("-5.00B");
  });

  it("leads a negative sub-K value with a minus", () => {
    expect(formatCompact(-950)).toBe("-950");
  });
});

describe("formatCompactUsd", () => {
  it("prefixes the dollar sign for zero", () => {
    expect(formatCompactUsd(0)).toBe("$0");
  });

  it("prefixes the dollar sign for a positive magnitude", () => {
    expect(formatCompactUsd(1.23e9)).toBe("$1.23B");
  });

  it("places the minus before the dollar sign for a negative value", () => {
    // Sign leads the $ so it reads naturally: "-$5.00B" not "$-5.00B".
    expect(formatCompactUsd(-5e9)).toBe("-$5.00B");
  });

  it("formats a negative trillion with leading minus-dollar", () => {
    expect(formatCompactUsd(-2.1e12)).toBe("-$2.10T");
  });

  it("formats hundreds of millions in dollars", () => {
    expect(formatCompactUsd(340e6)).toBe("$340.00M");
  });
});

describe("prettySlug", () => {
  it("title-cases a single word", () => {
    expect(prettySlug("lido")).toBe("Lido");
  });

  it("splits on hyphens and title-cases each word", () => {
    expect(prettySlug("rocket-pool")).toBe("Rocket Pool");
  });

  it("splits on underscores too", () => {
    expect(prettySlug("aave_v3")).toBe("Aave V3");
  });

  it("drops empty segments from doubled separators", () => {
    expect(prettySlug("a--b")).toBe("A B");
  });
});

describe("formatBtc", () => {
  it("renders 100+ BTC with no decimals (1e10 sats)", () => {
    expect(formatBtc(1e10)).toBe("100 BTC");
  });

  it("renders whole-BTC range with two decimals (1e8 sats)", () => {
    expect(formatBtc(1e8)).toBe("1.00 BTC");
  });

  it("renders the 0.001–1 BTC tier with four decimals", () => {
    // 420_000 sats = 0.0042 BTC.
    expect(formatBtc(420_000)).toBe("0.0042 BTC");
  });

  it("switches to a grouped sats readout below 0.001 BTC", () => {
    // 50_000 sats = 0.0005 BTC → falls through to the sats branch.
    expect(formatBtc(50_000)).toBe("50,000 sats");
  });

  it("rounds fractional sats in the sats branch", () => {
    expect(formatBtc(1234.6)).toBe("1,235 sats");
  });

  it("shows zero as sats", () => {
    expect(formatBtc(0)).toBe("0 sats");
  });
});

describe("formatHashrate", () => {
  it("keeps sub-1000 H/s with two decimals in the base unit", () => {
    // v < 10 → 2 decimals.
    expect(formatHashrate(5)).toBe("5.00 H/s");
  });

  it("uses one decimal for the 10–99 range", () => {
    expect(formatHashrate(42)).toBe("42.0 H/s");
  });

  it("uses no decimals for the 100–999 range", () => {
    expect(formatHashrate(500)).toBe("500 H/s");
  });

  it("steps up one SI unit at exactly 1000", () => {
    // 1000 H/s → 1.00 kH/s.
    expect(formatHashrate(1000)).toBe("1.00 kH/s");
  });

  it("steps through multiple units for a large hashrate", () => {
    // 612 EH/s = 612e18 H/s.
    expect(formatHashrate(612e18)).toBe("612 EH/s");
  });

  it("uses one decimal for a tens-of-exahash rate", () => {
    expect(formatHashrate(61.2e18)).toBe("61.2 EH/s");
  });

  it("stops at the top ZH/s unit even when the value stays huge", () => {
    // The loop halts at the last unit index (i < units.length - 1), so an
    // over-large value keeps growing the number rather than adding a unit:
    // 5e24 / 1000^7 = 5000, and 5000 >= 100 → no decimals.
    expect(formatHashrate(5e24)).toBe("5000 ZH/s");
  });
});

describe("timeAgo", () => {
  const NOW = 1_700_000_000_000; // fixed wall clock

  afterEach(() => {
    vi.useRealTimers();
  });

  function at(deltaMs: number): string {
    return timeAgo(NOW - deltaMs);
  }

  it("returns 'now' for the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(at(0)).toBe("now");
  });

  it("returns 'now' for anything under a minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(at(59_000)).toBe("now");
  });

  it("clamps a future timestamp to 'now'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // ms is in the future → sec is clamped to >= 0.
    expect(timeAgo(NOW + 60_000)).toBe("now");
  });

  it("renders minutes below an hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(at(5 * 60_000)).toBe("5m");
  });

  it("renders hours below a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(at(3 * 60 * 60_000)).toBe("3h");
  });

  it("renders days below a week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(at(2 * 24 * 60 * 60_000)).toBe("2d");
  });

  it("renders weeks below five weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(at(4 * 7 * 24 * 60 * 60_000)).toBe("4w");
  });

  it("falls back to a short date past five weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // 10 weeks back → beyond the wk < 5 branch → localized "Mon D".
    const past = NOW - 10 * 7 * 24 * 60 * 60_000;
    const expected = new Date(past).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    expect(timeAgo(past)).toBe(expected);
    // Guard: the fallback is a date label, not one of the relative tokens.
    expect(expected).not.toMatch(/^\d+[mhdw]$/);
  });
});
