import { BarChart } from "@zframes/charts";
import { defineFrame, useProtocolTvl } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { protocolTvlByCategoryMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = protocolTvlByCategoryMeta.schema;

function ProtocolTvlByCategory({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolTvl();

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
  if (data.length === 0) return <FrameStatus>no protocol TVL data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 26, 96)}
        formatValue={formatCompactUsd}
      />
      <div className="caption text-soft text-center">DeFi TVL · by category</div>
    </div>
  );
}

export const protocolTvlByCategoryFrame = defineFrame({
  ...protocolTvlByCategoryMeta,
  component: ProtocolTvlByCategory,
});
