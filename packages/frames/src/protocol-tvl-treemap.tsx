import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useProtocolTvl } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { protocolTvlTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = protocolTvlTreemapMeta.schema;

interface ProtocolNode extends TreeNode {
  tvl: number;
  changePct: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: ProtocolNode;
}) {
  const value = formatCompactUsd(data.tvl);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value} TVL`}
    />
  );
}

function ProtocolTvlTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolTvl();

  const data: ProtocolNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.tvl,
        tvl: entry.tvl,
        changePct: entry.changePct ?? 0,
      })),
    [entries, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading protocol TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no protocol TVL data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
    />
  );
}

export const protocolTvlTreemapFrame = defineFrame({
  ...protocolTvlTreemapMeta,
  component: ProtocolTvlTreemap,
});
