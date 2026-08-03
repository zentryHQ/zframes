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
    <div className="relative h-full min-h-0">
      <HeatmapChart
        data={cells}
        CellComponent={Cell}
        gap={3}
        showLabels
        rowLabelWidth={56}
        columnLabelHeight={20}
      />
      {/* No header row to place the control in — overlaid top-right rather
          than stacked above, which would steal height from the grid. */}
      <div className="pointer-events-none absolute top-0 right-0 z-10">
        <div className="pointer-events-auto">
          <TimeframeToggle
            options={LOOKBACK_OPTIONS}
            value={lookback}
            onChange={setLookback}
            label="ETF flow calendar lookback"
          />
        </div>
      </div>
    </div>
  );
}

export const etfFlowCalendarFrame = defineFrame({
  ...etfFlowCalendarMeta,
  component: EtfFlowCalendar,
});
