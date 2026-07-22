import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useFinancialStress } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ofrStressCategoryAreaMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = ofrStressCategoryAreaMeta.schema;

/** Camel-case field on FinancialStressPoint → display label, in stack order
 *  bottom-to-top (matches the category order OFR itself publishes). */
const CATEGORY_FIELDS = [
  ["credit", "Credit"],
  ["equityValuation", "Equity valuation"],
  ["safeAssets", "Safe assets"],
  ["funding", "Funding"],
  ["volatility", "Volatility"],
] as const;

function dayLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** Index units, not dollars — signed, so keep the explicit "+" like the
 *  headline card. */
function formatIndex(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

/** StackedAreaChart has no built-in legend (unlike MultiSeriesLineChart), so
 *  each frame that uses it draws its own from the same series/color pairs. */
function SeriesLegend({
  series,
}: {
  series: { id: string; name: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {series.map((s) => (
        <span
          key={s.id}
          className="caption text-soft flex items-center gap-1"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: s.color }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function OfrStressCategoryArea({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { stress, isLoading } = useFinancialStress();

  const series = useMemo(() => {
    const points = (stress?.trend ?? [])
      .slice(-config.trendDays)
      .filter(
        (p) =>
          p.credit !== undefined &&
          p.equityValuation !== undefined &&
          p.safeAssets !== undefined &&
          p.funding !== undefined &&
          p.volatility !== undefined,
      );
    if (points.length < 2) return [];
    return CATEGORY_FIELDS.map(([key, name], i) => ({
      id: key,
      name,
      color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
      data: points.map((p) => ({ date: new Date(p.time), value: p[key]! })),
    }));
  }, [stress, config.trendDays]);

  if (isLoading)
    return <FrameStatus loading>loading stress categories…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>no stress-category data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="caption text-soft uppercase">OFR FSI by category</div>
        <div className="caption text-soft text-right">
          {stress ? stress.date : ""}
        </div>
      </div>
      <StackedAreaChart
        series={series}
        height={210}
        formatXAxis={dayLabel}
        formatYAxis={formatIndex}
        formatValue={formatIndex}
      />
      <SeriesLegend series={series} />
    </div>
  );
}

export const ofrStressCategoryAreaFrame = defineFrame({
  ...ofrStressCategoryAreaMeta,
  component: OfrStressCategoryArea,
});
