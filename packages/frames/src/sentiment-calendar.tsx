import { CalendarHeatmap, type CalendarDatum } from "@zframes/charts";
import { defineFrame, useFearGreed } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { sentimentCalendarMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = sentimentCalendarMeta.schema;

/**
 * The index's own neutral line. Plotting `value − NEUTRAL` rather than the raw
 * 0–100 reading is what makes the grid diverge: fear falls below it and takes
 * the down colour, greed rises above it and takes the up colour, matching how
 * the gauge itself is read. The tooltip adds it back, so a square still reports
 * the real published number.
 */
const NEUTRAL = 50;

function SentimentCalendar({ config }: { config: z.output<typeof schema> }) {
  const { points, isLoading } = useFearGreed(config.days);

  const { data, mean, fearDays } = useMemo(() => {
    const series: CalendarDatum[] = points.map((p) => ({
      date: p.time,
      value: p.value - NEUTRAL,
    }));
    const total = points.reduce((sum, p) => sum + p.value, 0);
    return {
      data: series,
      mean: points.length > 0 ? total / points.length : 0,
      fearDays: points.filter((p) => p.value < NEUTRAL).length,
    };
  }, [points]);

  // Only blank the card before the first history lands — a background refresh
  // keeps the grid on screen instead of flashing to a skeleton.
  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading sentiment history…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>sentiment history unavailable</FrameStatus>;

  const greedDays = data.length - fearDays;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="min-h-0 flex-1">
        <CalendarHeatmap
          data={data}
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          weekStart={config.weekStart}
          formatValue={(v) => `${Math.round(v + NEUTRAL)} / 100`}
          legendLowLabel="fear"
          legendHighLabel="greed"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] pt-1">
        <span className="caption text-soft min-w-0 truncate">
          fear &amp; greed ·{" "}
          <span style={{ color: DOWN_COLOR }}>{fearDays}</span>
          {" / "}
          <span style={{ color: UP_COLOR }}>{greedDays}</span> days
        </span>
        {/* The index is a 0–100 score, not a percentage — no "%" suffix. */}
        <span className="caption text-soft shrink-0">
          avg {Math.round(mean)}
        </span>
      </div>
    </div>
  );
}

export const sentimentCalendarFrame = defineFrame({
  ...sentimentCalendarMeta,
  component: SentimentCalendar,
});
