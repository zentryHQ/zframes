import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useProtocolFees } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { protocolFeesTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = protocolFeesTreemapMeta.schema;

interface FeesNode extends TreeNode {
  fees24h: number;
  changePct: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: FeesNode;
}) {
  const value = formatCompactUsd(data.fees24h);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value} 24h fees`}
    />
  );
}

function ProtocolFeesTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolFees();

  const data: FeesNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.fees24h,
        fees24h: entry.fees24h,
        changePct: entry.changePct ?? 0,
      })),
    [entries, config.topN],
  );

  if (isLoading)
    return <FrameStatus loading>loading protocol fees…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no protocol fee data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
    />
  );
}

export const protocolFeesTreemapFrame = defineFrame({
  ...protocolFeesTreemapMeta,
  component: ProtocolFeesTreemap,
});
