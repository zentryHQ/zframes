import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMacroReferenceSeries,
  useMetalHistory,
  useMoney,
  type OfficialSeries,
  type SeriesPoint,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { changeColor, formatChangePct } from "./format";
import {
  alignSeries,
  correlation,
  downsample,
  metalName,
  pctChange,
  simpleReturns,
  sliceYears,
  timeframeFor,
  toChartData,
  valueAtOrBefore,
} from "./metals-shared";
import {
  formatSeriesChange,
  formatSeriesValue,
} from "./official-series-shared";
import { metalVsMacroMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalVsMacroMeta.schema;

/** One date where both legs have an observation. */
type Pair = { time: number; metal: number; macro: number };

/** Stable reference so the chart's D3 draw effect doesn't re-run every render.
 *  The axis is a position inside each leg's own window range, not a unit. */
const formatWindowRange = (value: number) => `${Math.round(value)}`;

/**
 * Scale a series onto 0–100 across its OWN window range (0 = window low,
 * 100 = window high).
 *
 * The chart layer has a single y-axis and these two legs are in different units
 * — dollars per ounce against a yield in percent or an index level — so
 * something has to make them share it. The obvious choice, rebasing both to an
 * index of 100 at the window start, is wrong for half the series on offer here:
 * a real yield crosses zero, so the base can be ~0 (the ratio explodes) or
 * negative (the line inverts, and the card then reads exactly backwards).
 *
 * Min-max is an affine map, so it preserves each leg's SHAPE exactly and cannot
 * flip the sign of the correlation quoted beside it. What it drops is relative
 * amplitude, which is why the header quotes both legs in their real units.
 */
function scaleToWindowRange(points: readonly SeriesPoint[]): SeriesPoint[] {
  let low = Infinity;
  let high = -Infinity;
  for (const p of points) {
    if (p.value < low) low = p.value;
    if (p.value > high) high = p.value;
  }
  const span = high - low;
  // A leg that never moved has no range to scale into; park it mid-axis rather
  // than divide by zero.
  if (!(span > 0)) return points.map((p) => ({ time: p.time, value: 50 }));
  return points.map((p) => ({
    time: p.time,
    value: ((p.value - low) / span) * 100,
  }));
}

/**
 * Consecutive changes in the macro leg, in the unit its own readers quote:
 * percentage POINTS for a rate, percent for an index level — the same split
 * `formatSeriesChange` makes, so the caption's coefficient is built from the
 * quantity the header's move reports.
 *
 * Correlating CHANGES rather than levels is the point of the card. Two trending
 * series correlate near ±1 on their levels whatever their relationship is —
 * gold and the broad dollar index both drifted up across 2006–2026 — so a
 * levels-correlation would answer "is it still holding?" with total confidence
 * and no information.
 */
function macroChanges(
  values: readonly number[],
  unit: OfficialSeries["unit"],
): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1)
    out.push(
      unit === "percent"
        ? values[i] - values[i - 1]
        : pctChange(values[i - 1], values[i]),
    );
  return out;
}

/**
 * Plain-English gloss on the coefficient, matching
 * `metal-positioning-vs-price`'s wording so two correlation cards on one board
 * don't describe the same number two different ways.
 */
function describeCorrelation(corr: number): string {
  if (corr >= 0.6) return "moving together";
  if (corr >= 0.2) return "loosely linked";
  if (corr > -0.2) return "unrelated";
  if (corr > -0.6) return "leaning apart";
  return "moving opposite";
}

function MetalVsMacro({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { histories, isLoading: fixLoading } = useMetalHistory([config.symbol]);
  const { series: macro, isLoading: macroLoading } = useMacroReferenceSeries(
    config.series,
  );

  const fixes = useMemo(
    () => histories.find((h) => h.symbol === config.symbol)?.points ?? [],
    [histories, config.symbol],
  );

  const view = useMemo(() => {
    if (!macro || fixes.length === 0) return null;

    // Two pairing rules, because three of the four ids are daily and the fourth
    // is monthly:
    //  - DAILY: intersect on the days both actually printed. The LBMA runs a
    //    London holiday calendar and FRED a US one, so an index-wise zip would
    //    quote a Tuesday yield against a Thursday fix.
    //  - MONTHLY: one print a month rarely lands on a fix day at all, so
    //    intersecting would leave a near-empty sample. Sample the fix at or
    //    before each print instead — the rule `metal-positioning-vs-price` uses
    //    for weekly COT against the daily fix.
    const pairs: Pair[] =
      macro.frequency === "monthly"
        ? sliceYears(macro.points, config.years).flatMap((p) => {
            const metal = valueAtOrBefore(fixes, p.time);
            return metal === null || metal <= 0
              ? []
              : [{ time: p.time, metal, macro: p.value }];
          })
        : alignSeries(sliceYears(fixes, config.years), macro.points).map(
            (p) => ({ time: p.time, metal: p.a, macro: p.b }),
          );
    // Three observations is the floor for a correlation of changes worth
    // printing (two changes); below that the card says so instead.
    if (pairs.length < 3) return null;

    const thinned = downsample(pairs);
    const series: MultiSeriesData[] = [
      {
        id: "metal",
        name: metalName(config.symbol),
        color: CHART_COLORS_MULTI_SERIES[2],
        data: toChartData(
          scaleToWindowRange(
            thinned.map((p) => ({ time: p.time, value: p.metal })),
          ),
        ),
      },
      {
        id: "macro",
        name: macro.label,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(
          scaleToWindowRange(
            thinned.map((p) => ({ time: p.time, value: p.macro })),
          ),
        ),
      },
    ];

    return {
      series,
      macroLabel: macro.label,
      macroValue: formatSeriesValue(macro.latest, macro.unit),
      macroMove: formatSeriesChange(macro.change, macro.unit),
      macroDate: macro.date,
      // Built from the RAW pairs, not the thinned or scaled lines: min-max
      // scaling can't change a correlation, but downsampling would throw away
      // observations, and this coefficient is what the card is actually asked
      // for.
      corr: correlation(
        simpleReturns(pairs.map((p) => ({ time: p.time, value: p.metal }))),
        macroChanges(
          pairs.map((p) => p.macro),
          macro.unit,
        ),
      ),
      observations: pairs.length - 1,
      cadence: macro.frequency === "monthly" ? "monthly" : "daily",
      metalNow: pairs[pairs.length - 1].metal,
      metalWindowPct: pctChange(pairs[0].metal, pairs[pairs.length - 1].metal),
      // The years the OVERLAP actually covers, not the years asked for: three of
      // the four macro series begin in the 2000s, so a 30-year window quietly
      // becomes a 20-year one and the header must not claim otherwise.
      span: `${new Date(pairs[0].time).getUTCFullYear()}–${new Date(
        pairs[pairs.length - 1].time,
      ).getUTCFullYear()}`,
    };
  }, [fixes, macro, config.symbol, config.years]);

  // Two capabilities: one leg landing before the other is the normal first
  // paint, so name the one still outstanding rather than showing a bare
  // skeleton.
  if (!view) {
    if (fixLoading || macroLoading)
      return (
        <FrameStatus loading>
          loading{" "}
          {fixes.length === 0 ? "London fix history" : "the macro series"}…
        </FrameStatus>
      );
    return (
      <FrameStatus>
        {fixes.length === 0
          ? "no London fix history yet"
          : `not enough overlap between the fix and ${config.series} in this window`}
      </FrameStatus>
    );
  }

  return (
    <ChartCard>
      {/* Not `CardHeader`: the two legs are SYMMETRIC — both are `metric-md`
          heroes, and the right column has to shrink and truncate its own long
          series label ("10y TIPS real yield"), where the shared aside is
          `shrink-0` so the left column absorbs the squeeze. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft truncate uppercase">
            {metalName(config.symbol)}
          </div>
          <div className="metric-md text-strong leading-none tabular-nums">
            {money.price(view.metalNow)}
          </div>
          <div
            className="caption tabular-nums"
            style={{ color: changeColor(view.metalWindowPct) }}
          >
            {formatChangePct(view.metalWindowPct)} · {view.span}
          </div>
        </div>
        <div className="min-w-0 shrink text-right">
          <div className="caption text-soft truncate uppercase">
            {view.macroLabel}
          </div>
          <div className="metric-md text-strong leading-none tabular-nums">
            {view.macroValue}
          </div>
          <div className="caption text-soft tabular-nums">
            {view.macroMove} · {view.macroDate}
          </div>
        </div>
      </div>

      <ChartCard.Body>
        <TimeSeriesChart
          series={view.series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatWindowRange}
        />
      </ChartCard.Body>

      {/* Two lines on purpose, so `leading-snug` is what keeps the pair inside
          a short card. */}
      <ChartCard.Caption className="leading-snug">
        corr {view.corr.toFixed(2)} of {view.observations} {view.cadence}{" "}
        changes — {describeCorrelation(view.corr)}
        <br />
        each leg scaled to its own window range (0 = low, 100 = high)
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalVsMacroFrame = defineFrame({
  ...metalVsMacroMeta,
  component: MetalVsMacro,
});
