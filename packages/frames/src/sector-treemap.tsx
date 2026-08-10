import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useSectorPerformance } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
import { sectorTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = sectorTreemapMeta.schema;

interface SectorNode extends TreeNode {
  marketCap: number;
  changePct24h: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: SectorNode;
}) {
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={formatChangePct(data.changePct24h)}
    />
  );
}

function SectorTreemap({ config }: { config: z.output<typeof schema> }) {
  const { sectors, isLoading } = useSectorPerformance();
  const money = useMoney();

  const data: SectorNode[] = useMemo(
    () =>
      sectors.slice(0, config.limit).map((s) => ({
        id: s.name,
        value: s.marketCap,
        marketCap: s.marketCap,
        changePct24h: s.changePct24h,
      })),
    [sectors, config.limit],
  );

  const shownCap = useMemo(
    () => data.reduce((sum, node) => sum + node.marketCap, 0),
    [data],
  );

  if (isLoading) return <FrameStatus loading>loading sectors…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no sector data yet</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct24h}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "mcap", value: money.compact(node.marketCap) },
          {
            label: "24h",
            value: formatChangePct(node.changePct24h),
            color: changeColor(node.changePct24h),
          },
        ],
        footer:
          shownCap > 0
            ? `${formatPct((node.marketCap / shownCap) * 100)} of sectors shown`
            : undefined,
      })}
    />
  );
}

export const sectorTreemapFrame = defineFrame({
  ...sectorTreemapMeta,
  component: SectorTreemap,
});
