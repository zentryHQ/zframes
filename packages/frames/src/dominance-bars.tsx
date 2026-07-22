import { BarChart } from "@zframes/charts";
import { defineFrame, useGlobalMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { dominanceBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dominanceBarsMeta.schema;

function DominanceBars({ config }: { config: z.output<typeof schema> }) {
  const { market, isLoading } = useGlobalMarket();

  const data = useMemo(() => {
    if (!market) return [];
    return Object.entries(market.dominance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.limit)
      .map(([symbol, pct]) => ({ label: symbol.toUpperCase(), value: pct }));
  }, [market, config.limit]);

  if (isLoading) return <FrameStatus loading>loading dominance…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no dominance data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 24, 96)}
        formatValue={(v) => formatPct(v, 1)}
      />
      <div className="caption text-soft text-center">
        market-cap share · top {data.length}
      </div>
    </div>
  );
}

export const dominanceBarsFrame = defineFrame({
  ...dominanceBarsMeta,
  component: DominanceBars,
});
