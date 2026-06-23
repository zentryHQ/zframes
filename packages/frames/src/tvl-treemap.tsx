import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useTvlByChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { tvlTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = tvlTreemapMeta.schema;

interface TvlNode extends TreeNode {
  tvl: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: TvlNode;
}) {
  const value = formatCompactUsd(data.tvl);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value}`}
    />
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
