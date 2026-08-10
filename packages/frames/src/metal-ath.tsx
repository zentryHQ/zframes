import { defineFrame, useMetalHistory, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { MetricRow } from "./metric-row";
import {
  allTimeHigh,
  durationSince,
  metalName,
  pctChange,
} from "./metals-shared";
import { metalAthMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalAthMeta.schema;

const formatDay = (time: number) =>
  new Date(time).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

function MetalAth({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { histories, isLoading } = useMetalHistory([config.symbol]);
  const points = histories[0]?.points;

  // A 58-year fix file is ~14,600 points and the frame re-renders on every
  // poll tick, so the scan for the record is memoised on the series identity.
  const { ath, latest, belowPct } = useMemo(() => {
    const series = points ?? [];
    const high = allTimeHigh(series);
    const last = series.at(-1) ?? null;
    return {
      ath: high,
      latest: last,
      // Negative unless today IS the record, so the semantic tint reads green
      // only at a new high.
      belowPct: high && last ? pctChange(high.value, last.value) : 0,
    };
  }, [points]);

  if (isLoading && !ath)
    return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (!ath || !latest) return <FrameStatus>no fix history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5">
      <div>
        <div className="caption text-soft uppercase">
          {metalName(config.symbol)} record fix
        </div>
        <div className="metric-lg text-strong leading-none">
          {money.price(ath.value)}
        </div>
        <div className="caption text-soft">{formatDay(ath.time)}</div>
      </div>

      {/* The record itself is pinned; the three rows under it scroll rather than
          clip, so a card shorter than the stack loses reach to a row instead of
          slicing "Since record" through the middle. */}
      <div className={`min-w-0 ${scrollAreaClass}`}>
        <MetricRow
          label="Latest fix"
          meta={formatDay(latest.time)}
          value={money.price(latest.value)}
        />
        <MetricRow
          label="Below record"
          value={
            <span style={{ color: changeColor(belowPct) }}>
              {formatChangePct(belowPct)}
            </span>
          }
        />
        <MetricRow label="Since record" value={durationSince(ath.time)} />
      </div>
    </div>
  );
}

export const metalAthFrame = defineFrame({
  ...metalAthMeta,
  component: MetalAth,
});
