import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useEtfFlows, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { etfFlowCalendarMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const LOOKBACK_MS = {
  "1M": 30 * 86_400_000,
  "3M": 90 * 86_400_000,
  "6M": 180 * 86_400_000,
} as const;

const schema = etfFlowCalendarMeta.schema;

const LOOKBACK_OPTIONS = ["1M", "3M", "6M"] as const;

/** Most recent Monday on/before `ms`, at local midnight — anchors the grid so
 *  the earliest row is a full week and weekday columns land in a stable
 *  Mon→Sun order (HeatmapChart orders rows/columns by first occurrence). */
function mondayOnOrBefore(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7; // Sun=0..Sat=6 -> days since Monday
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

function Cell({
  data,
  width,
  height,
}: {
  data: HeatmapCell;
  width: number;
  height: number;
}) {
  const money = useMoney();
  if (width < 40 || height < 18) return null;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="caption text-normal tabular-nums">
        {money.compact(data.value)}
      </span>
    </div>
  );
}

function EtfFlowCalendar({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  const { flows, isLoading } = useEtfFlows(config.asset);
  const cutoff = useMemo(
    () => mondayOnOrBefore(Date.now() - LOOKBACK_MS[lookback]),
    [lookback],
  );

  const cells: HeatmapCell[] = useMemo(
    () =>
      (flows?.history ?? [])
        .filter((p) => p.time >= cutoff)
        .map((p) => ({
          id: String(p.time),
          row: new Date(mondayOnOrBefore(p.time)).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          column: new Date(p.time).toLocaleDateString("en-US", {
            weekday: "short",
          }),
          value: p.value,
        })),
    [flows, cutoff],
  );

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (cells.length === 0)
    return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    // A slim row above the chart, NOT the top-right overlay the other
    // header-less frames use: this heatmap draws its weekday column labels
    // (Mon–Fri, HTML spans) exactly there, and the overlay sat on top of "Thu"
    // and "Fri". Occluding a chart's own axis labels is worse than spending
    // ~18px, so this one frame reserves the space instead.
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex flex-none justify-end">
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="ETF flow calendar lookback"
        />
      </div>
      <div className="min-h-0 flex-1">
        <HeatmapChart
          data={cells}
          CellComponent={Cell}
          gap={3}
          showLabels
          rowLabelWidth={56}
          columnLabelHeight={20}
        />
      </div>
    </div>
  );
}

export const etfFlowCalendarFrame = defineFrame({
  ...etfFlowCalendarMeta,
  component: EtfFlowCalendar,
});
