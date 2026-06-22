import { parseMarketData, TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useDexVolume } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { dexVolumeTreemapMeta } from "./schemas";
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
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={`${data.id} · $${parseMarketData(data.volume24h)} 24h volume`}
    >
      <span className="body-sm truncate font-bold text-white">{data.id}</span>
      {!compact && (
        <span className="caption text-white/70">
          ${parseMarketData(data.volume24h)}
        </span>
      )}
    </div>
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
