import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useDexVolume } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { dexVolumeTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = dexVolumeTreemapMeta.schema;

interface VolNode extends TreeNode {
  volume24h: number;
  changePct: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: VolNode;
}) {
  const value = formatCompactUsd(data.volume24h);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value} 24h volume`}
    />
  );
}

function DexVolumeTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useDexVolume();

  const data: VolNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.volume24h,
        volume24h: entry.volume24h,
        changePct: entry.changePct ?? 0,
      })),
    [entries, config.topN],
  );

  if (isLoading)
    return <FrameStatus loading>loading DEX volume…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no DEX volume data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
    />
  );
}

export const dexVolumeTreemapFrame = defineFrame({
  ...dexVolumeTreemapMeta,
  component: DexVolumeTreemap,
});
