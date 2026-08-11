import { BarChart } from "@zframes/charts";
import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { yieldMomentumBarsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = yieldMomentumBarsMeta.schema;

function YieldMomentumBars({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useYieldPools();

  const data = useMemo(() => {
    const ranked = pools
      .filter((p) => p.apyPct7D !== null && p.tvlUsd >= config.minTvlUsd)
      .sort((a, b) => (b.apyPct7D as number) - (a.apyPct7D as number));
    // Diverging chart: the N/2 biggest 7d APY gains (top) and N/2 biggest
    // drops (bottom), skipped when there aren't enough distinct pools.
    const half = Math.floor(config.limit / 2);
    const picked =
      ranked.length <= config.limit
        ? ranked
        : [...ranked.slice(0, half), ...ranked.slice(-half)];
    return picked.map((p) => ({
      label: p.symbol,
      value: p.apyPct7D as number,
    }));
  }, [pools, config.limit, config.minTvlUsd]);

  if (isLoading) return <FrameStatus loading>loading yields…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no pools match</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      {/* Scrolls rather than shrinks: the height is a COUNT of bars, each
          needing its own row to stay readable, so a card shorter than the
          list should let you reach the rest rather than squash every bar. */}
      <div className={scrollAreaClass}>
        <BarChart
          data={data}
          orientation="horizontal"
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          height={Math.max(data.length * 22, 96)}
          formatValue={formatChangePct}
        />
      </div>
      <div className="caption text-soft shrink-0 text-center">
        top {data.length} · 7d APY change
      </div>
    </div>
  );
}

export const yieldMomentumBarsFrame = defineFrame({
  ...yieldMomentumBarsMeta,
  component: YieldMomentumBars,
});
