import {
  CHART_COLORS_MULTI_SERIES,
  sampleStats,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMetalHistory, type SeriesPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { ChartCard } from "./chart-card";
import {
  alignSeries,
  correlation,
  downsample,
  metalName,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalRollingCorrelationMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalRollingCorrelationMeta.schema;

/** Local, as in `metals-correlation` — metals-shared keeps its own copy private. */
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Both statistics are unit-less multiples, so — as in `metals-correlation` —
 *  none of `./format` fits: neither is a percentage, a signed delta or a rate.
 *  Two decimals is how the desk quotes them ("0.87", "1.42"). Module-level so
 *  the chart's D3 draw effect doesn't re-run every render. */
const formatCoefficient = (value: number) => value.toFixed(2);

/** One trading day's move in both legs, as log returns. */
interface PairedReturn {
  time: number;
  base: number;
  quote: number;
}

/**
 * Daily LOG returns of two fix series, paired on the days they both fixed.
 *
 * Two decisions worth stating, because getting either wrong yields a chart that
 * looks entirely plausible and says nothing:
 *  - **Returns, not levels.** Two metals that both trended up for decades
 *    correlate at ~0.99 whatever their real relationship, so a rolling window on
 *    prices reports "still tracking" forever and can never show a regime change.
 *  - **Logs, not percent changes.** A log return is additive across days and
 *    symmetric in sign, so a −10%/+11% round trip contributes a matched pair
 *    rather than a spurious upward drift in the covariance.
 *
 * The legs are day-aligned first: the LBMA runs a different holiday calendar per
 * metal, so an index-wise zip would pair a Tuesday move with a Thursday one.
 */
function pairedLogReturns(
  base: readonly SeriesPoint[],
  quote: readonly SeriesPoint[],
): PairedReturn[] {
  const aligned = alignSeries(base, quote);
  const out: PairedReturn[] = [];
  for (let i = 1; i < aligned.length; i += 1) {
    const prev = aligned[i - 1];
    const curr = aligned[i];
    if (prev.a > 0 && prev.b > 0 && curr.a > 0 && curr.b > 0)
      out.push({
        time: curr.time,
        base: Math.log(curr.a / prev.a),
        quote: Math.log(curr.b / prev.b),
      });
  }
  return out;
}

/**
 * The rolling statistic, one point per day once the window has filled.
 *
 * Neither statistic is defined here: the correlation is the same
 * `metals-shared` helper the correlation matrix uses, and beta is expressed as
 * `r · σ_quote / σ_base` — algebraically identical to `cov/var` — so it falls
 * out of that same correlation plus the charts layer's `sampleStats`. One
 * definition of "how these two move together" for the whole package.
 */
function rollingPairStat(
  pairs: readonly PairedReturn[],
  window: number,
  metric: "correlation" | "beta",
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let end = window - 1; end < pairs.length; end += 1) {
    const slice = pairs.slice(end - window + 1, end + 1);
    const baseLeg = slice.map((p) => p.base);
    const quoteLeg = slice.map((p) => p.quote);
    const r = correlation(baseLeg, quoteLeg);
    if (metric === "correlation") {
      out.push({ time: pairs[end].time, value: r });
      continue;
    }
    const baseStats = sampleStats(baseLeg);
    const quoteStats = sampleStats(quoteLeg);
    // A window in which the base never moved has no beta — skipped rather than
    // reported as 0, which would read as "the quote ignores it".
    if (!baseStats || !quoteStats || baseStats.stdev <= 0) continue;
    out.push({
      time: pairs[end].time,
      value: r * (quoteStats.stdev / baseStats.stdev),
    });
  }
  return out;
}

/**
 * Plain-language read of the correlation — the answer to "is it still tracking",
 * which is the question the card exists for. Deliberately un-tinted in the
 * header: a low correlation is the *news*, not a loss, so the semantic up/down
 * pair would misread it as one.
 */
function readCorrelation(value: number, base: string, quote: string): string {
  if (value >= 0.8) return `${quote} moving as one with ${base}`;
  if (value >= 0.5) return `${quote} still tracking ${base}`;
  if (value > 0.2) return "loosely linked";
  if (value > -0.2) return "decoupled — the relationship has broken";
  return `${quote} moving against ${base}`;
}

/** How much the quote leg amplifies or damps the base's moves. */
function readBeta(value: number, base: string, quote: string): string {
  if (value >= 1.25) return `${quote} amplifies ${base} moves`;
  if (value >= 0.75) return "roughly one-for-one";
  if (value > 0.25) return `${quote} damps ${base} moves`;
  if (value > -0.25) return `barely responds to ${base}`;
  return `${quote} moves inversely to ${base}`;
}

function MetalRollingCorrelation({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const samePair = config.base === config.quote;
  // Hook first, unconditionally — the same-metal guard is an early return below.
  // Ask for one symbol when they match, so the misconfigured case doesn't fetch
  // the same fix file twice.
  const { histories, isLoading } = useMetalHistory(
    samePair ? [config.base] : [config.base, config.quote],
  );

  const view = useMemo(() => {
    const basePoints =
      histories.find((h) => h.symbol === config.base)?.points ?? [];
    const quotePoints =
      histories.find((h) => h.symbol === config.quote)?.points ?? [];
    const pairs = pairedLogReturns(basePoints, quotePoints);
    if (pairs.length < config.window) return null;

    // Unlike the level frames, this one can't window before the maths: a rolling
    // statistic needs its warm-up. But it needs EXACTLY `window` observations of
    // it, so rolling over gold's full 58 years to draw the last 10 is six times
    // the work for the same line. Trim to the plotted span plus the warm-up.
    const cutoff = pairs[pairs.length - 1].time - config.years * YEAR_MS;
    const firstPlotted = pairs.findIndex((p) => p.time >= cutoff);
    const start = Math.max(0, firstPlotted - (config.window - 1));
    const rolled = rollingPairStat(
      pairs.slice(start),
      config.window,
      config.metric,
    );
    // With less history than the window needs there is nothing to plot — one
    // coefficient would be a dot, not a regime.
    if (rolled.length < 2) return null;

    const thinned = downsample(rolled);
    const series: MultiSeriesData[] = [
      {
        id: config.metric,
        name: `${metalName(config.quote)} vs ${metalName(config.base)}`,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(thinned),
      },
    ];

    let yDomain: [number, number] = [-1, 1];
    if (config.metric === "beta") {
      // Beta is unbounded, so the domain is derived — but 0 and 1 are kept on
      // the axis, the way `metal-cot-net` keeps zero: 1.00 is "moves one-for-one"
      // and 0 is "ignores it", and a domain cropped above them hides the two
      // levels the line is read against. Loop, not `Math.min(...values)`: a
      // 58-year window is thousands of points and spreading that into an
      // argument list is a stack risk for no gain.
      let low = 0;
      let high = 1;
      for (const point of thinned) {
        if (point.value < low) low = point.value;
        if (point.value > high) high = point.value;
      }
      const pad = (high - low) * 0.06;
      yDomain = [low - pad, high + pad];
    }

    // Non-null by construction — `rolled` already has two finite points, and
    // both statistics are finite by definition. Checked rather than asserted so
    // the shape below stays a plain number.
    const stats = sampleStats(rolled.map((p) => p.value));
    if (!stats) return null;
    return {
      series,
      yDomain,
      current: rolled[rolled.length - 1].value,
      average: stats.mean,
      // What the window actually covers: the fix files start in 1968 (gold and
      // silver) or 1990 (platinum and palladium), so a 20y ask on a platinum
      // pair measures what exists rather than what was requested.
      spanYears: Math.max(
        1,
        Math.round((rolled[rolled.length - 1].time - rolled[0].time) / YEAR_MS),
      ),
    };
  }, [
    histories,
    config.base,
    config.quote,
    config.window,
    config.years,
    config.metric,
  ]);

  if (samePair)
    return (
      <FrameStatus>
        a correlation needs two different metals — pick a different base or
        quote
      </FrameStatus>
    );
  // Only blank the card before the first fix history lands — a background
  // refresh keeps the chart on screen instead of flashing to a skeleton.
  if (isLoading && !view)
    return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (!view)
    return (
      <FrameStatus>
        not enough overlapping {metalName(config.base)} /{" "}
        {metalName(config.quote)} fixes for a {config.window}-day window
      </FrameStatus>
    );

  const isBeta = config.metric === "beta";
  const base = metalName(config.base);
  const quote = metalName(config.quote);
  const read = isBeta
    ? readBeta(view.current, base, quote)
    : readCorrelation(view.current, base, quote);

  return (
    <ChartCard gap={1.5}>
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Value size="metric-md">
            {formatCoefficient(view.current)}
          </CardHeader.Value>
          <CardHeader.Sub size="caption" className="mt-1 truncate">
            {read}
          </CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Value>{formatCoefficient(view.average)}</CardHeader.Value>
          <CardHeader.Sub>avg of {view.spanYears}y</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      <ChartCard.Body>
        <TimeSeriesChart
          series={view.series}
          timeframe={timeframeFor(config.years)}
          fill
          yDomain={view.yDomain}
          formatValue={formatCoefficient}
        />
      </ChartCard.Body>

      <ChartCard.Caption>
        {config.window}d rolling {isBeta ? "beta" : "correlation"} of daily log
        returns ·{" "}
        {isBeta
          ? "1.00 is one-for-one"
          : "axis fixed −1…+1, with 0 the middle tick"}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalRollingCorrelationFrame = defineFrame({
  ...metalRollingCorrelationMeta,
  component: MetalRollingCorrelation,
});
