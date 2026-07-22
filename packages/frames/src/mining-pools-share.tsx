import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useMiningPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { miningPoolsShareMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = miningPoolsShareMeta.schema;

function MiningPoolsShare({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useMiningPools(config.window);

  const slices = useMemo(() => {
    const all = pools?.pools ?? [];
    const top = all.slice(0, config.topN);
    const rest = all.slice(config.topN);
    const named = top.map((p) => ({
      name: p.name,
      value: p.blockCount,
      sharePct: p.sharePct,
    }));
    const restBlocks = rest.reduce((sum, p) => sum + p.blockCount, 0);
    if (restBlocks > 0) {
      named.push({
        name: "Other",
        value: restBlocks,
        sharePct: rest.reduce((sum, p) => sum + p.sharePct, 0),
      });
    }
    return named.map((slice, i) => ({
      ...slice,
      color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
    }));
  }, [pools, config.topN]);

  const top3Share = useMemo(
    () =>
      [...slices]
        .filter((slice) => slice.name !== "Other")
        .sort((a, b) => b.sharePct - a.sharePct)
        .slice(0, 3)
        .reduce((sum, slice) => sum + slice.sharePct, 0),
    [slices],
  );

  if (isLoading) return <FrameStatus loading>loading pools…</FrameStatus>;
  if (slices.length === 0) return <FrameStatus>no mining data yet</FrameStatus>;

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
          <span className="caption text-soft uppercase">top 3</span>
          <span className="metric-lg text-strong leading-none">
            {formatPct(top3Share, 0)}
          </span>
        </div>
      </PieChart>

      <div className="flex w-full max-w-xs flex-wrap justify-center gap-x-4 gap-y-1.5">
        {slices.map((slice) => (
          <div key={slice.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span className="body-sm text-soft">{slice.name}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {formatPct(slice.sharePct, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const miningPoolsShareFrame = defineFrame({
  ...miningPoolsShareMeta,
  component: MiningPoolsShare,
});
