import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useDexVolume, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
import { dexVolumeTreemapMeta } from "./schemas";
import { treemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = dexVolumeTreemapMeta.schema;

interface VolNode extends TreeNode {
  volume24h: number;
  changePct: number;
}

const Leaf = treemapLeaf<VolNode>(
  (d) => d.id,
  (d, money) => money.compact(d.volume24h),
);

function DexVolumeTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useDexVolume();
  const money = useMoney();

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

  // Share-of-total is read against the tiles actually drawn — the treemap only
  // shows the top N, so a share of the whole DEX universe wouldn't add to 100%.
  const shownVolume = useMemo(
    () => data.reduce((sum, node) => sum + node.volume24h, 0),
    [data],
  );

  if (isLoading) return <FrameStatus loading>loading DEX volume…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no DEX volume data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "24h vol", value: money.compact(node.volume24h) },
          {
            label: "1d",
            value: formatChangePct(node.changePct),
            color: changeColor(node.changePct),
          },
        ],
        footer:
          shownVolume > 0
            ? `${formatPct((node.volume24h / shownVolume) * 100, 1)} of top ${data.length}`
            : undefined,
      })}
    />
  );
}

export const dexVolumeTreemapFrame = defineFrame({
  ...dexVolumeTreemapMeta,
  component: DexVolumeTreemap,
});
