import {
  CHART_COLORS_MULTI_SERIES,
  HistogramChart,
  quantile,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useCommodityVolIndex } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import {
  downsample,
  percentileRank,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { SeriesHeader, formatSeriesValue } from "./official-series-shared";
import { commodityVolRegimeMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = commodityVolRegimeMeta.schema;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** How many years each window option ranks against; null = the whole file. */
const WINDOW_YEARS: Record<string, number | null> = {
  all: null,
  "10y": 10,
  "5y": 5,
  "1y": 1,
};

/** "38th", "1st", "22nd" — a percentile reads as a rank, not a quantity.
 *  A local copy of `metal-volatility`'s helper; neither file owns it, and
 *  `./format` has no ordinal primitive to route through yet. */
function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** What the reading means to someone about to buy or sell the option. */
function classify(percentile: number): string {
  if (percentile >= 90) return "options very expensive";
  if (percentile >= 70) return "options expensive";
  if (percentile > 30) return "middle of the range";
  if (percentile > 10) return "options cheap";
  return "options very cheap";
}

/** The tint `metal-volatility` uses, for the same reason: volatility is a risk
 *  reading, so calm is "up" and violent is "down", and the middle of the range
 *  gets no tint at all because it isn't news either way. It ranks the LEVEL
 *  against its own history — unlike the `SeriesHeader` above it, which tints the
 *  direction of the last print. */
function volatilityColor(percentile: number): string | undefined {
  if (percentile >= 70) return DOWN_COLOR;
  if (percentile <= 30) return UP_COLOR;
  return undefined;
}

function CommodityVolRegime({ config }: { config: z.output<typeof schema> }) {
  const { series: index, isLoading } = useCommodityVolIndex(config.index);

  const view = useMemo(() => {
    if (!index) return null;
    const years = WINDOW_YEARS[config.window] ?? null;
    const windowed =
      years === null ? index.points : sliceYears(index.points, years);
    // A percentile needs a distribution to rank against: one close would always
    // come out 100th ("very expensive") on no evidence at all.
    if (windowed.length < 2) return null;

    const values = windowed.map((p) => p.value);
    const latest = values[values.length - 1];
    const sorted = [...values].sort((a, b) => a - b);

    return {
      values,
      latest,
      median: quantile(sorted, 0.5),
      // Ranked against exactly what is charted, so the headline and the plot
      // can't disagree about which window "the range" means.
      percentile: percentileRank(values, latest),
      // The years actually covered, never the years requested. The published
      // files begin in 2009 (GVZ, OVX) and 2011 (VXSLV, VXGDX) — "full history"
      // is ~15 years at the most, and a 10-year window on VXGDX is most of its
      // file rather than a decade inside it.
      span: `${new Date(windowed[0].time).getUTCFullYear()}–${new Date(
        windowed[windowed.length - 1].time,
      ).getUTCFullYear()}`,
      spanYears:
        (windowed[windowed.length - 1].time - windowed[0].time) / MS_PER_YEAR,
      chart: [
        {
          id: index.seriesId,
          name: index.label,
          color: CHART_COLORS_MULTI_SERIES[0],
          data: toChartData(downsample(windowed)),
        },
      ] satisfies MultiSeriesData[],
    };
  }, [index, config.window]);

  /**
   * The publisher's own unit drives every number on the card, through the shared
   * official-series helpers. These indices are published as LEVELS
   * (`unit: "index"`, the same convention FRED's VIXCLS arrives under — 25.59,
   * not "25.59%"), which is also what makes `OfficialSeries.change` a percent
   * change here rather than basis points. Not money under either unit, so no
   * `useMoney()` and no currency symbol.
   */
  const formatValue = useMemo(() => {
    const unit = index?.unit ?? "index";
    return (value: number) => formatSeriesValue(value, unit);
  }, [index?.unit]);

  // Only blank the card before the first history lands — a background refresh
  // keeps the plot on screen instead of flashing back to a skeleton.
  if (isLoading && !view)
    return (
      <FrameStatus loading>loading implied-volatility history…</FrameStatus>
    );
  if (!index || !view)
    return (
      <FrameStatus>
        not enough {config.index} history in this window yet
      </FrameStatus>
    );

  const { values, latest, median, percentile, span, spanYears, chart } = view;
  // Clamped to 1…100: the reading is itself one of the ranked samples, so it can
  // never be "0th", but a decade holds ~2,500 of them and a fresh low would
  // round 0.04 down to a nonsensical "0th pctile".
  const rank = Math.min(100, Math.max(1, Math.round(percentile)));
  const color = volatilityColor(percentile);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {/* Label, cadence, last print, level and move all through the shared
          official-series header — so this card denominates the same kind of
          number in the same way an equity-vol card built on VIXCLS does. */}
      <SeriesHeader series={index} />

      <div className="flex items-baseline justify-between gap-3">
        <div className="body-md truncate tabular-nums" style={{ color }}>
          {ordinal(rank)} pctile · {classify(percentile)}
        </div>
        <div className="caption text-soft shrink-0 tabular-nums">
          30-day implied · {span}
        </div>
      </div>

      {/* The line chart is the card's dependent — it absorbs whatever height is
          left once the header and the distribution strip below have taken
          theirs, so a short card shrinks the plot instead of clipping it. */}
      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={chart}
          timeframe={timeframeFor(spanYears)}
          fill
          formatValue={formatValue}
        />
      </div>

      {/* The distribution is what turns a level into "cheap or expensive": the
          bars are how often this index has printed each level over the window,
          and the markers are where the median and today sit in it. Bin edges are
          NOT anchored to zero — an implied-volatility index cannot be negative
          and rarely reaches single digits, so a zero anchor would spend a third
          of the strip on levels that cannot happen. */}
      <HistogramChart
        values={values}
        height={92}
        anchorZero={false}
        showYAxis={false}
        formatValue={formatValue}
        markers={[
          { value: median, label: "median" },
          { value: latest, label: "now" },
        ]}
      />
    </div>
  );
}

export const commodityVolRegimeFrame = defineFrame({
  ...commodityVolRegimeMeta,
  component: CommodityVolRegime,
});
