import type { OfficialSeries } from "@zframes/core";
import { CardHeader } from "./card-header";
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
 *
 * A thin adapter over {@link CardHeader}: the two-column row, the left column's
 * `min-w-0`, its truncating eyebrow and the right column's `shrink-0` all come
 * from the primitive now, and this module keeps only what an official published
 * series needs on top of it — the `OfficialSeries` signature and the unit-aware
 * formatters above, whose percent-vs-basis-points distinction is the whole
 * point of the module.
 *
 * Four of its five lines are slots. The print date asks for `ink="normal"`,
 * because the publisher's own date and cadence are read as data here where the
 * sub-line's default is the quieter `soft`; the move and the optional note ask
 * for `tabular-nums` through `className`, since the sub-line deliberately
 * carries none of its own (which is what keeps word-shaped sub-lines across the
 * other frames from having tabular digits retro-fitted onto them).
 *
 * One line stays its own element. This head INVERTS the usual columns — the
 * label sits left and the figure right — so its hero lives in the aside, and
 * `CardHeader.Value` inks an aside `text-normal`, the weight of a *supporting*
 * number. A hero reads `text-strong` wherever it sits, and `size` cannot say
 * so, so the figure keeps its own `div` until `Value` takes an ink.
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
    <CardHeader align="start">
      <CardHeader.Main>
        <CardHeader.Eyebrow>{series.label}</CardHeader.Eyebrow>
        <CardHeader.Sub ink="normal">
          {series.date} · {CADENCE_LABEL[series.frequency]}
        </CardHeader.Sub>
      </CardHeader.Main>
      <CardHeader.Aside>
        {/* `ink="strong"`: this head inverts the usual columns — the label is
            on the left and the HERO figure on the right — so the aside carries
            the emphasis its column default would not give it. */}
        <CardHeader.Value
          size="metric-md"
          ink="strong"
          className="tabular-nums"
        >
          {formatSeriesValue(series.latest, series.unit)}
        </CardHeader.Value>
        <CardHeader.Sub tint={color} className="tabular-nums">
          {formatSeriesChange(series.change, series.unit)}
        </CardHeader.Sub>
        {note !== undefined && (
          <CardHeader.Sub className="tabular-nums">{note}</CardHeader.Sub>
        )}
      </CardHeader.Aside>
    </CardHeader>
  );
}
