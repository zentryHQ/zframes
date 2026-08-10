import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useProtocolTvl } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
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
  const money = useMoney();
  const value = money.compact(data.tvl);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
    />
  );
}

function ProtocolTvlTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolTvl();
  const money = useMoney();

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

  const shownTvl = useMemo(
    () => data.reduce((sum, node) => sum + node.tvl, 0),
    [data],
  );

  if (isLoading)
    return <FrameStatus loading>loading protocol TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no protocol TVL data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "TVL", value: money.compact(node.tvl) },
          {
            label: "24h",
            value: formatChangePct(node.changePct),
            color: changeColor(node.changePct),
          },
        ],
        footer:
          shownTvl > 0
            ? `${formatPct((node.tvl / shownTvl) * 100)} of top ${data.length} TVL`
            : undefined,
      })}
    />
  );
}

export const protocolTvlTreemapFrame = defineFrame({
  ...protocolTvlTreemapMeta,
  component: ProtocolTvlTreemap,
});
