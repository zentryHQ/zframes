import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useFinancialStress } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ofrStressCategoryAreaMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
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
      <div className="min-h-0 flex-1">
        <StackedAreaChart
          series={series}
          fill
          formatXAxis={dayLabel}
          formatYAxis={formatIndex}
          formatValue={formatIndex}
        />
      </div>
      {/* Name-only: a stacked band's own share is read off the chart, so the
          legend just says which colour is which. */}
      <SliceLegend size="sm">
        {series.map((s) => (
          <SliceLegend.Item key={s.id} color={s.color} label={s.name} />
        ))}
      </SliceLegend>
    </div>
  );
}

export const ofrStressCategoryAreaFrame = defineFrame({
  ...ofrStressCategoryAreaMeta,
  component: OfrStressCategoryArea,
});
