import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useOpenInterest } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompactUsd } from "./format";
import { oiTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = oiTreemapMeta.schema;

interface OiNode extends TreeNode {
  oiUsd: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: OiNode;
}) {
  const value = formatCompactUsd(data.oiUsd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value} open interest`}
    />
  );
}

function OiTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useOpenInterest();

  const data: OiNode[] = useMemo(() => {
    const sorted = [...entries]
      .filter((e) => e.openInterestUsd > 0)
      .sort((a, b) => b.openInterestUsd - a.openInterestUsd);
    const top = sorted.slice(0, config.limit);
    const nodes: OiNode[] = top.map((e) => ({
      id: tickerOf(e.symbol),
      value: e.openInterestUsd,
      oiUsd: e.openInterestUsd,
    }));
    const rest = sorted.slice(config.limit);
    const restUsd = rest.reduce((sum, e) => sum + e.openInterestUsd, 0);
    if (restUsd > 0)
      nodes.push({ id: "Other", value: restUsd, oiUsd: restUsd });
    return nodes;
  }, [entries, config.limit]);

  if (isLoading)
    return <FrameStatus loading>loading open interest…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no open-interest data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.oiUsd}
    />
  );
}

export const oiTreemapFrame = defineFrame({
  ...oiTreemapMeta,
  component: OiTreemap,
});
