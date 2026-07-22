import { BarChart } from "@zframes/charts";
import { defineFrame, useTrendingCoins } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { trendingBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = trendingBarsMeta.schema;

function TrendingBars({ config }: { config: z.output<typeof schema> }) {
  const { coins, isLoading } = useTrendingCoins();

  const data = useMemo(
    () =>
      coins
        .filter((c) => c.changePct24h !== null && Number.isFinite(c.changePct24h))
        .slice(0, config.limit)
        .sort((a, b) => b.changePct24h! - a.changePct24h!)
        .map((c) => ({ label: c.symbol, value: c.changePct24h! })),
    [coins, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading trending…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no trending data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={formatChangePct}
      />
    </div>
  );
}

export const trendingBarsFrame = defineFrame({
  ...trendingBarsMeta,
  component: TrendingBars,
});
