import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useMoney, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import { formatPct } from "./format";
import { yieldRiskPieMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
import { FrameStatus } from "./ui";

const RISK_LABEL: Record<string, string> = {
  no: "No IL Risk",
  yes: "IL Risk",
  unknown: "Unknown",
};

function YieldRiskPie() {
  const { pools, isLoading } = useYieldPools();
  const money = useMoney();

  const slices = useMemo(() => {
    const byRisk = new Map<string, number>();
    for (const p of pools) {
      const key =
        p.ilRisk === "no" || p.ilRisk === "yes" ? p.ilRisk : "unknown";
      byRisk.set(key, (byRisk.get(key) ?? 0) + p.tvlUsd);
    }
    return [...byRisk.entries()]
      .map(([risk, value], i) => ({
        name: RISK_LABEL[risk] ?? risk,
        value,
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
      }))
      .filter((slice) => slice.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [pools]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (isLoading) return <FrameStatus loading>loading yield pools…</FrameStatus>;
  if (slices.length === 0) return <FrameStatus>no yield data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4">
      <div className="min-h-0 w-full flex-1">
        {/* `fill` scales the ring to the card; width/height stay behind it as
            the reference box the radii keep their proportions against. */}
        <PieChart
          data={slices}
          fill
          width={188}
          height={188}
          innerRadius={54}
          outerRadius={86}
          colors={slices.map((slice) => slice.color)}
        >
          <div className="flex max-w-[100px] flex-col items-center gap-0.5">
            <span className="caption text-soft">TVL by IL risk</span>
            <span className="metric-md text-strong leading-none tabular-nums">
              {money.compact(total)}
            </span>
          </div>
        </PieChart>
      </div>

      <SliceLegend>
        {slices.map((slice) => (
          <SliceLegend.Item
            key={slice.name}
            color={slice.color}
            label={slice.name}
          >
            {formatPct((slice.value / total) * 100, 1)}
            {/* The absolute TVL rides inside the share, quieter than it —
                `SliceLegend.Item` has one value slot, and the share is the
                figure the legend is for. */}
            <span className="caption text-soft ml-1.5">
              {money.compact(slice.value)}
            </span>
          </SliceLegend.Item>
        ))}
      </SliceLegend>
    </div>
  );
}

export const yieldRiskPieFrame = defineFrame({
  ...yieldRiskPieMeta,
  component: YieldRiskPie,
});
