import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useOpenInterest } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatPct } from "./format";
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
  const money = useMoney();
  const value = money.compact(data.oiUsd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
    />
  );
}

function OiTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useOpenInterest();
  const money = useMoney();

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

  const totalUsd = useMemo(
    () => data.reduce((sum, node) => sum + node.oiUsd, 0),
    [data],
  );

  if (isLoading)
    return <FrameStatus loading>loading open interest…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no open-interest data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.oiUsd}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "open interest", value: money.compact(node.oiUsd) },
          {
            label: "share",
            value: formatPct(
              totalUsd > 0 ? (node.oiUsd / totalUsd) * 100 : 0,
              1,
            ),
          },
        ],
        footer: `of ${money.compact(totalUsd)} total open interest`,
      })}
    />
  );
}

export const oiTreemapFrame = defineFrame({
  ...oiTreemapMeta,
  component: OiTreemap,
});
