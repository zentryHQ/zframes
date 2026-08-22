import { defineFrame, useLightningStats } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatBtc, formatChangePct } from "./format";
import { lightningStatsMeta } from "./schemas";
import { Stat } from "./stat";
import { FrameStatus } from "./ui";

const schema = lightningStatsMeta.schema;

function deltaPct(now: number, prev?: number): number | null {
  if (prev == null || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

/**
 * The tile's third line. Not a `Stat.Hint`: the delta is a semantic gain/loss
 * reading and has to carry `changeColor`, which `Stat.Hint` deliberately does
 * not take — a hint is a quiet denominator, not a tinted figure.
 */
function DeltaLine({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  return (
    <span
      className="caption font-bold tabular-nums"
      style={{ color: changeColor(delta) }}
    >
      {formatChangePct(delta)}
    </span>
  );
}

function LightningStatsFrame({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useLightningStats();

  if (isLoading) return <FrameStatus loading>loading lightning…</FrameStatus>;
  if (!stats) return <FrameStatus>no lightning data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <Stat.Strip cols={3} gap={1.5}>
        {/* Value above label — the order IS the layout, no prop for it. */}
        <Stat surface="tile" align="center" className="justify-center gap-1">
          <Stat.Value size="metric-sm">
            {stats.nodeCount.toLocaleString("en-US")}
          </Stat.Value>
          <Stat.Label>nodes</Stat.Label>
          <DeltaLine delta={deltaPct(stats.nodeCount, stats.prevNodeCount)} />
        </Stat>
        <Stat surface="tile" align="center" className="justify-center gap-1">
          <Stat.Value size="metric-sm">
            {stats.channelCount.toLocaleString("en-US")}
          </Stat.Value>
          <Stat.Label>channels</Stat.Label>
          <DeltaLine
            delta={deltaPct(stats.channelCount, stats.prevChannelCount)}
          />
        </Stat>
        <Stat surface="tile" align="center" className="justify-center gap-1">
          <Stat.Value size="metric-sm">
            {formatBtc(stats.totalCapacity)}
          </Stat.Value>
          <Stat.Label>capacity</Stat.Label>
          <DeltaLine
            delta={deltaPct(stats.totalCapacity, stats.prevTotalCapacity)}
          />
        </Stat>
      </Stat.Strip>

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
