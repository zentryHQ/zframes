import { BarChart } from "@zframes/charts";
import { defineFrame, useMoney, useProtocolTvl } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { protocolTvlByCategoryMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = protocolTvlByCategoryMeta.schema;

function ProtocolTvlByCategory({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { entries, isLoading } = useProtocolTvl();
  const money = useMoney();

  const data = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const e of entries) {
      const key = e.category ?? "Other";
      byCategory.set(key, (byCategory.get(key) ?? 0) + e.tvl);
    }
    return [...byCategory.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, config.limit);
  }, [entries, config.limit]);

  if (isLoading)
    return <FrameStatus loading>loading protocol TVL…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no protocol TVL data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      {/* Scrolls rather than shrinks: the height is a COUNT of bars, each
          needing its own row to stay readable, so a card shorter than the
          list should let you reach the rest rather than squash every bar. */}
      <div className={scrollAreaClass}>
        <BarChart
          data={data}
          orientation="horizontal"
          height={Math.max(data.length * 26, 96)}
          formatValue={money.compact}
        />
      </div>
      <div className="caption text-soft shrink-0 text-center">
        DeFi TVL · by category
      </div>
    </div>
  );
}

export const protocolTvlByCategoryFrame = defineFrame({
  ...protocolTvlByCategoryMeta,
  component: ProtocolTvlByCategory,
});
