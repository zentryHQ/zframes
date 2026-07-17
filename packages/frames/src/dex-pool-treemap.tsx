import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useDexPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct, formatCompactUsd } from "./format";
import { dexPoolTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = dexPoolTreemapMeta.schema;

interface PoolNode extends TreeNode {
  volume24hUsd: number;
  changePct24h: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: PoolNode;
}) {
  const vol = formatCompactUsd(data.volume24hUsd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={vol}
      title={`${data.id} · ${vol} vol · ${formatChangePct(data.changePct24h)}`}
    />
  );
}

function DexPoolTreemap({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useDexPools(config.network);

  const data: PoolNode[] = useMemo(
    () =>
      pools
        .filter((p) => p.volume24hUsd > 0)
        .slice(0, config.count)
        .map((p) => ({
          id: p.name,
          value: p.volume24hUsd,
          volume24hUsd: p.volume24hUsd,
          changePct24h: p.changePct24h,
        })),
    [pools, config.count],
  );

  if (isLoading) return <FrameStatus loading>loading hot pools…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no pool data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct24h}
    />
  );
}

export const dexPoolTreemapFrame = defineFrame({
  ...dexPoolTreemapMeta,
  component: DexPoolTreemap,
});
