import { BarChart } from "@zframes/charts";
import { defineFrame, useGlobalMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { dominanceBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dominanceBarsMeta.schema;

function formatShare(v: number) {
  return formatPct(v, 1);
}

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
  if (data.length === 0)
    return <FrameStatus>no dominance data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      <div className="min-h-0 flex-1">
        <BarChart
          data={data}
          orientation="horizontal"
          fill
          formatValue={formatShare}
        />
      </div>
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
