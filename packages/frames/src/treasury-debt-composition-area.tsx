import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useNationalDebt } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { treasuryDebtCompositionAreaMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = treasuryDebtCompositionAreaMeta.schema;

function dayLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
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
      <StackedAreaChart
        series={series}
        height={210}
        formatXAxis={dayLabel}
        formatYAxis={formatCompactUsd}
        formatValue={formatCompactUsd}
      />
      <SeriesLegend series={series} />
    </div>
  );
}

export const treasuryDebtCompositionAreaFrame = defineFrame({
  ...treasuryDebtCompositionAreaMeta,
  component: TreasuryDebtCompositionArea,
});
