import { defineFrame, useLightningStats } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatBtc } from "./format";
import { lightningStatsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = lightningStatsMeta.schema;

function deltaPct(now: number, prev?: number): number | null {
  if (prev == null || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-white/[0.04] px-2 py-2 text-center">
      <span className="font-dmsans text-strong text-xl font-bold leading-none tabular-nums">
        {value}
      </span>
      <span className="caption text-soft mt-1">{label}</span>
      {delta !== null && (
        <span
          className="caption mt-0.5 font-bold tabular-nums"
          style={{ color: changeColor(delta) }}
        >
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function LightningStatsFrame({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useLightningStats();

  if (isLoading) return <FrameStatus loading>loading lightning…</FrameStatus>;
  if (!stats) return <FrameStatus>no lightning data</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat
          label="nodes"
          value={stats.nodeCount.toLocaleString("en-US")}
          delta={deltaPct(stats.nodeCount, stats.prevNodeCount)}
        />
        <Stat
          label="channels"
          value={stats.channelCount.toLocaleString("en-US")}
          delta={deltaPct(stats.channelCount, stats.prevChannelCount)}
        />
        <Stat
          label="capacity"
          value={formatBtc(stats.totalCapacity)}
          delta={deltaPct(stats.totalCapacity, stats.prevTotalCapacity)}
        />
      </div>

      {config.showSplit && (
        <div className="caption text-soft text-center">
          {stats.clearnetNodes.toLocaleString("en-US")} clearnet ·{" "}
          {stats.torNodes.toLocaleString("en-US")} tor
        </div>
      )}
    </div>
  );
}

export const lightningStatsFrame = defineFrame({
  ...lightningStatsMeta,
  component: LightningStatsFrame,
});
