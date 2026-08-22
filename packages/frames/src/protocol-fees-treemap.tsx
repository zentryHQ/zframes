import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useProtocolFees } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
import { protocolFeesTreemapMeta } from "./schemas";
import { treemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = protocolFeesTreemapMeta.schema;

interface FeesNode extends TreeNode {
  fees24h: number;
  changePct: number;
}

const Leaf = treemapLeaf<FeesNode>(
  (d) => d.id,
  (d, money) => money.compact(d.fees24h),
);

function ProtocolFeesTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolFees();
  const money = useMoney();

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

  const shown = useMemo(
    () => data.reduce((sum, node) => sum + node.fees24h, 0),
    [data],
  );

  if (isLoading)
    return <FrameStatus loading>loading protocol fees…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no protocol fee data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "24h fees", value: money.compact(node.fees24h) },
          {
            label: "1d",
            value: formatChangePct(node.changePct),
            color: changeColor(node.changePct),
          },
        ],
        footer:
          shown > 0
            ? `${formatPct((node.fees24h / shown) * 100)} of shown fees`
            : undefined,
      })}
    />
  );
}

export const protocolFeesTreemapFrame = defineFrame({
  ...protocolFeesTreemapMeta,
  component: ProtocolFeesTreemap,
});
