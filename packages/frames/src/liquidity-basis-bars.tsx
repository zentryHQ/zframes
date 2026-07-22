import { BarChart } from "@zframes/charts";
import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { DOWN_COLOR, UP_COLOR, formatPct } from "./format";
import { liquidityBasisBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = liquidityBasisBarsMeta.schema;

/** Signed basis points, e.g. "+4.2bps" / "-1.8bps" — format.ts covers percent
 *  formatting but not bps, so this stays local to the one frame that needs it. */
function formatBps(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}bps`;
}

function LiquidityBasisBars({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useDayStatsState();
  const metric = config.metric;

  const data = useMemo(() => {
    const rows: { label: string; value: number }[] = [];
    for (const [symbol, s] of Object.entries(stats)) {
      if (metric === "spread") {
        const [bid, ask] = s.impactPxs ?? [];
        if (bid === undefined || ask === undefined || s.markPx <= 0) continue;
        rows.push({
          label: tickerOf(symbol),
          value: ((ask - bid) / s.markPx) * 100,
        });
      } else {
        if (s.premium === undefined) continue;
        rows.push({ label: tickerOf(symbol), value: s.premium * 10_000 });
      }
    }
    return rows
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, config.limit)
      .sort((a, b) => b.value - a.value);
  }, [stats, metric, config.limit]);

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no liquidity data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={metric === "spread" ? (v) => formatPct(v, 2) : formatBps}
      />
      <div className="caption text-soft text-center">
        {metric === "spread"
          ? "impact-price spread, % of mark"
          : "mark-vs-oracle basis"}{" "}
        · top {data.length}
      </div>
    </div>
  );
}

export const liquidityBasisBarsFrame = defineFrame({
  ...liquidityBasisBarsMeta,
  component: LiquidityBasisBars,
});
