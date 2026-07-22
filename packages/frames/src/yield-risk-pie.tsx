import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import { formatCompactUsd, formatPct } from "./format";
import { yieldRiskPieMeta } from "./schemas";
import { FrameStatus } from "./ui";

const RISK_LABEL: Record<string, string> = {
  no: "No IL Risk",
  yes: "IL Risk",
  unknown: "Unknown",
};

function YieldRiskPie() {
  const { pools, isLoading } = useYieldPools();

  const slices = useMemo(() => {
    const byRisk = new Map<string, number>();
    for (const p of pools) {
      const key = p.ilRisk === "no" || p.ilRisk === "yes" ? p.ilRisk : "unknown";
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <PieChart
        data={slices}
        width={188}
        height={188}
        innerRadius={54}
        outerRadius={86}
        colors={slices.map((slice) => slice.color)}
      >
        <div className="flex flex-col items-center gap-0.5">
          <span className="caption text-soft">TVL by IL risk</span>
          <span className="metric-lg text-strong leading-none">
            {formatCompactUsd(total)}
          </span>
        </div>
      </PieChart>

      <div className="flex w-full max-w-xs flex-wrap justify-center gap-x-5 gap-y-1.5">
        {slices.map((slice) => (
          <div key={slice.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span className="body-sm text-soft">{slice.name}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {formatPct((slice.value / total) * 100, 1)}
            </span>
            <span className="caption text-soft tabular-nums">
              {formatCompactUsd(slice.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const yieldRiskPieFrame = defineFrame({
  ...yieldRiskPieMeta,
  component: YieldRiskPie,
});
