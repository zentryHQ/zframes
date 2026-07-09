import { MiniLineChart } from "@zframes/charts";
import type { ReactNode } from "react";
import type { SeriesPoint } from "@zframes/spec";
import { toSparkline } from "./indicators";

/** A valuation zone: a short label + the semantic tint it reads with. */
export interface Zone {
  label: string;
  /** A CSS color — use UP_COLOR/DOWN_COLOR (or a neutral) from ./format. */
  color: string;
}

/**
 * Non-semantic zone tints for the middle bands. Distinct from UP_COLOR/DOWN_COLOR
 * (which carry gain/loss meaning and rotate with the theme) — these just mark
 * "neutral" and "caution/elevated" and are safe as literals.
 */
export const ZONE_NEUTRAL = "#cbd5e1";
export const ZONE_WARN = "#f5a524";

/**
 * The shared headline layout for the single-metric on-chain / cycle gauges
 * (MVRV, NUPL, SOPR, Puell, Mayer, Pi Cycle, MA-multiplier, RSI, DXY). One
 * caption + big tinted numeral + zone badge + optional sub-readout + a sparkline
 * of recent history, so the whole family reads as one system instead of nine
 * bespoke cards. Frames own only the metric math + zone thresholds; this owns
 * the presentation.
 */
export function MetricGauge({
  caption,
  headline,
  headlineColor,
  zone,
  sub,
  sparkline,
  sparkColor,
}: {
  /** Small label above the numeral, e.g. "MVRV Ratio". */
  caption: string;
  /** The formatted headline value, e.g. "1.17" or "42%". */
  headline: string;
  /** Headline tint (usually the zone color). */
  headlineColor: string;
  /** The current valuation zone shown as a pill under the numeral. */
  zone: Zone;
  /** Optional secondary readout line (e.g. realized price, Z-score). */
  sub?: ReactNode;
  /** Recent history for the sparkline, oldest→newest. */
  sparkline: SeriesPoint[];
  /** Sparkline stroke color. */
  sparkColor: string;
}) {
  const data = toSparkline(sparkline);
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <div className="caption text-soft">{caption}</div>
      <div
        className="metric-xl leading-none"
        style={{ color: headlineColor, textShadow: `0 0 24px ${headlineColor}44` }}
      >
        {headline}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="caption rounded-full px-2 py-0.5 font-semibold"
          style={{ color: zone.color, background: `${zone.color}1f` }}
        >
          {zone.label}
        </span>
        {sub !== undefined && sub !== null && (
          <span className="caption text-soft truncate">{sub}</span>
        )}
      </div>
      {data.length > 1 && (
        <MiniLineChart
          data={data}
          width={280}
          height={44}
          color={sparkColor}
          className="w-full"
        />
      )}
    </div>
  );
}

/** Pick the first matching zone: the first band whose `test(value)` is true. */
export function zoneOf(
  value: number,
  bands: Array<{ upTo?: number; from?: number; zone: Zone }>,
  fallback: Zone,
): Zone {
  for (const band of bands) {
    const okUpper = band.upTo === undefined || value < band.upTo;
    const okLower = band.from === undefined || value >= band.from;
    if (okUpper && okLower) return band.zone;
  }
  return fallback;
}
