import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMetalHistory,
  useMetalPositioning,
  type SeriesPoint,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatChangePct } from "./format";
import {
  correlation,
  cotNet,
  downsample,
  metalName,
  rebaseToPct,
  sliceYears,
  timeframeFor,
  toChartData,
  valueAtOrBefore,
} from "./metals-shared";
import { metalPositioningVsPriceMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalPositioningVsPriceMeta.schema;

/**
 * Rebase the positioning leg so "up" always means "longer than the window
 * started". `rebaseToPct` measures change against the first value, which
 * *inverts* the line when specs open the window net SHORT: halving a short is a
 * bullish move, yet reads as −50%. Measuring against the base's magnitude
 * instead keeps the direction honest — and keeps the drawn line consistent with
 * the correlation in the caption, which is taken from the raw pairs.
 */
function rebaseAgainstBaseMagnitude(
  points: readonly SeriesPoint[],
): SeriesPoint[] {
  const rebased = rebaseToPct(points);
  if (points.length === 0 || points[0].value >= 0) return rebased;
  return rebased.map((p) => ({ time: p.time, value: -p.value }));
}

/** Plain-English gloss on the correlation coefficient in the caption. */
function describeCorrelation(corr: number): string {
  if (corr >= 0.6) return "moving together";
  if (corr >= 0.2) return "loosely linked";
  if (corr > -0.2) return "unrelated";
  if (corr > -0.6) return "leaning apart";
  return "moving opposite";
}

function MetalPositioningVsPrice({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { positioning, isLoading: cotLoading } = useMetalPositioning(
    config.symbol,
  );
  const { histories, isLoading: fixLoading } = useMetalHistory([config.symbol]);

  const weeks = positioning?.weeks;
  const fixes = useMemo(
    () => histories.find((h) => h.symbol === config.symbol)?.points ?? [],
    [histories, config.symbol],
  );

  const { series, corr, netBase } = useMemo(() => {
    const empty = { series: [] as MultiSeriesData[], corr: 0, netBase: 0 };
    const net = (weeks ?? []).map((w) => ({ time: w.time, value: cotNet(w) }));
    const windowed = sliceYears(net, config.years);
    // COT is weekly, the LBMA fixes daily — so sample the fix at or before each
    // report date instead of intersecting exact days. A Tuesday that fell on a
    // London holiday would otherwise drop the whole pair.
    const paired = windowed.flatMap((p) => {
      const price = valueAtOrBefore(fixes, p.time);
      return price === null || price <= 0
        ? []
        : [{ time: p.time, net: p.value, price }];
    });
    if (paired.length < 2) return empty;

    const thinned = downsample(paired);
    // Both legs rebased to 0% at the window start: contracts and dollars per
    // ounce share no axis otherwise.
    const netPct = rebaseAgainstBaseMagnitude(
      thinned.map((p) => ({ time: p.time, value: p.net })),
    );
    const pricePct = rebaseToPct(
      thinned.map((p) => ({ time: p.time, value: p.price })),
    );
    const built: MultiSeriesData[] = [
      {
        id: "price",
        name: `${metalName(config.symbol)} fix`,
        color: CHART_COLORS_MULTI_SERIES[2],
        data: toChartData(pricePct),
      },
      {
        id: "net",
        name: "Net spec position",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(netPct),
      },
    ];
    return {
      series: built,
      // Taken from the RAW pairs across the whole window, not the rebased,
      // thinned lines: a positive rescale can't change a correlation, so this is
      // the same coefficient the chart shows — but it keeps every week the
      // downsample dropped, and it can't pick up the sign flip a negative
      // rebase base would otherwise smuggle in.
      corr: correlation(
        paired.map((p) => p.net),
        paired.map((p) => p.price),
      ),
      netBase: thinned[0].net,
    };
  }, [weeks, fixes, config.years, config.symbol]);

  if ((cotLoading || fixLoading) && series.length === 0)
    return <FrameStatus loading>loading positioning vs price…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>no overlapping COT and fix data yet</FrameStatus>;

  return (
    <ChartCard>
      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatChangePct}
        />
      </ChartCard.Body>
      {/* Two lines on purpose, so `leading-snug` is what keeps the pair inside
          a short card. */}
      <ChartCard.Caption className="leading-snug">
        corr {corr.toFixed(2)} over {config.years}y —{" "}
        {describeCorrelation(corr)}
        <br />
        COT is weekly, published Friday for the prior Tuesday
        {netBase < 0 &&
          " · specs opened the window net short, so their line reads against the size of that short"}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalPositioningVsPriceFrame = defineFrame({
  ...metalPositioningVsPriceMeta,
  component: MetalPositioningVsPrice,
});
