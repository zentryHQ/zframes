import { BarChart } from "@zframes/charts";
import { defineFrame, useMoney, useTvlByChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tvlBarsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = tvlBarsMeta.schema;

function TvlBars({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useTvlByChain();
  const money = useMoney();

  const data = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, config.limit)
        .map((e) => ({ label: e.name, value: e.tvl })),
    [entries, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no TVL data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      {/* Scrolls rather than shrinks. The height is a COUNT of bars — each row
          needs its ~26px to stay readable — so on a card shorter than the list
          the honest degradation is to reach the rest, not to squash every bar
          past legibility. `fill` would do the latter. */}
      <div className={scrollAreaClass}>
        <BarChart
          data={data}
          orientation="horizontal"
          height={Math.max(data.length * 26, 96)}
          formatValue={money.compact}
        />
      </div>
      <div className="caption text-soft shrink-0 text-center">
        total value locked · by chain
      </div>
    </div>
  );
}

export const tvlBarsFrame = defineFrame({
  ...tvlBarsMeta,
  component: TvlBars,
});
