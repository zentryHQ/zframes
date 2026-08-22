import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useNationalDebt } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { treasuryDebtCompositionAreaMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
import { FrameStatus } from "./ui";

const schema = treasuryDebtCompositionAreaMeta.schema;

function dayLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function TreasuryDebtCompositionArea({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { debt, isLoading } = useNationalDebt(config.trendDays);

  const series = useMemo(() => {
    const points = (debt?.trend ?? []).filter(
      (p) => p.heldByPublic !== undefined && p.intragovernmental !== undefined,
    );
    if (points.length < 2) return [];
    return [
      {
        id: "public",
        name: "Held by public",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: points.map((p) => ({
          date: new Date(p.time),
          value: p.heldByPublic!,
        })),
      },
      {
        id: "intragov",
        name: "Intragovernmental",
        color: CHART_COLORS_MULTI_SERIES[1],
        data: points.map((p) => ({
          date: new Date(p.time),
          value: p.intragovernmental!,
        })),
      },
    ];
  }, [debt]);

  if (isLoading)
    return <FrameStatus loading>loading debt composition…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>no debt-composition data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="caption text-soft uppercase">debt composition</div>
        <div className="caption text-soft text-right">
          {debt ? `as of ${debt.date}` : ""}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <StackedAreaChart
          series={series}
          fill
          formatXAxis={dayLabel}
          formatYAxis={formatCompactUsd}
          formatValue={formatCompactUsd}
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

export const treasuryDebtCompositionAreaFrame = defineFrame({
  ...treasuryDebtCompositionAreaMeta,
  component: TreasuryDebtCompositionArea,
});
