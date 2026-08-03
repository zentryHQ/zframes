import type { OfficialSeries } from "@zframes/core";
import { changeColor, formatChangePct, formatLevel, formatPct } from "./format";

/**
 * Shared readout for the frames built on an {@link OfficialSeries} — the FRED
 * index levels, credit spreads, the national house-price index and the mortgage
 * rate. Four frames want the same three things above a chart (what it is, when
 * it last printed, where it stands and by how much it moved), so the header and
 * both formatters live here once rather than four slightly different ways.
 */

/** Format a series value in its own unit: a level, a percent, or a dollar sum. */
export function formatSeriesValue(
  value: number,
  unit: OfficialSeries["unit"],
): string {
  if (unit === "percent") return formatPct(value);
  // A `usd` official series is a US-macro aggregate (the carve-out that stays in
  // dollars); `index` is unit-less. Both read as a grouped level here.
  return formatLevel(value);
}

/**
 * Format the latest move the way the series' own readers quote it: a percent
 * change for a level, and **basis points** for a rate or spread — a high-yield
 * OAS going 2.84 → 2.87 is "+3 bps", and rendering that as "+1.06%" would state
 * a completely different quantity.
 */
export function formatSeriesChange(
  change: number,
  unit: OfficialSeries["unit"],
): string {
  if (unit !== "percent") return formatChangePct(change);
  const bps = Math.round(change * 100);
  return `${bps >= 0 ? "+" : ""}${bps} bps`;
}

/** How the publisher describes the cadence, for the "as of" line. */
const CADENCE_LABEL: Record<OfficialSeries["frequency"], string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
};

/**
 * The headline block: label + last print date on the left, the current value and
 * its move on the right. Tinted by direction through the shared semantic pair,
 * so it follows a board's custom up/down colours.
 */
export function SeriesHeader({
  series,
  note,
}: {
  series: OfficialSeries;
  /** Optional extra line under the value, e.g. a year-over-year change. */
  note?: string;
}) {
  const color = changeColor(series.change);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="caption text-soft truncate uppercase">
          {series.label}
        </div>
        <div className="body-sm text-normal">
          {series.date} · {CADENCE_LABEL[series.frequency]}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="metric-md text-strong leading-none tabular-nums">
          {formatSeriesValue(series.latest, series.unit)}
        </div>
        <div className="caption tabular-nums" style={{ color }}>
          {formatSeriesChange(series.change, series.unit)}
        </div>
        {note !== undefined && (
          <div className="caption text-soft tabular-nums">{note}</div>
        )}
      </div>
    </div>
  );
}
