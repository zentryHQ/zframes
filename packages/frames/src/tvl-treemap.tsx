import { parseMarketData, TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useTvlByChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tvlTreemapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = tvlTreemapMeta.schema;

interface TvlNode extends TreeNode {
  tvl: number;
}

function Leaf({ width, height, data }: { width: number; height: number; data: TvlNode }) {
  // Tiny leaves render clipped fragments — better to show nothing and let
  // size + hover carry the information.
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={`${data.id} · $${parseMarketData(data.tvl)}`}
    >
      <span className="body-sm truncate font-bold text-white">{data.id}</span>
      {!compact && (
        <span className="caption text-white/70">${parseMarketData(data.tvl)}</span>
      )}
    </div>
  );
}

function TvlTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useTvlByChain();

  const data: TvlNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.tvl,
        tvl: entry.tvl,
      })),
    [entries, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no TVL data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.tvl}
    />
  );
}

export const tvlTreemapFrame = defineFrame({
  ...tvlTreemapMeta,
  component: TvlTreemap,
});
