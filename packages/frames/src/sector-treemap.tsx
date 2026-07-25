import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useSectorPerformance } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct } from "./format";
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
  const money = useMoney();
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={formatChangePct(data.changePct24h)}
      title={`${data.id} · ${money.compact(data.marketCap)} · ${formatChangePct(data.changePct24h)}`}
    />
  );
}

function SectorTreemap({ config }: { config: z.output<typeof schema> }) {
  const { sectors, isLoading } = useSectorPerformance();

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

  if (isLoading) return <FrameStatus loading>loading sectors…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no sector data yet</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct24h}
    />
  );
}

export const sectorTreemapFrame = defineFrame({
  ...sectorTreemapMeta,
  component: SectorTreemap,
});
