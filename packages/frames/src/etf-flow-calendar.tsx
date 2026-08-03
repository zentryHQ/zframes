import { CalendarHeatmap, type CalendarDatum } from "@zframes/charts";
import { defineFrame, useEtfFlows, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { etfFlowCalendarMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const LOOKBACK_MS = {
  "1M": 30 * 86_400_000,
  "3M": 90 * 86_400_000,
  "6M": 180 * 86_400_000,
  "1Y": 365 * 86_400_000,
} as const;

const schema = etfFlowCalendarMeta.schema;

const LOOKBACK_OPTIONS = ["1M", "3M", "6M", "1Y"] as const;

function EtfFlowCalendar({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  const { flows, isLoading } = useEtfFlows(config.asset);
  // `money` is captured by the formatter closure rather than read inside it:
  // `formatValue` is a plain callback the chart invokes, not a component, so it
  // cannot call the hook itself.
  const money = useMoney();
  const cutoff = useMemo(() => Date.now() - LOOKBACK_MS[lookback], [lookback]);

  const { data, inflow, outflow } = useMemo(() => {
    const series: CalendarDatum[] = (flows?.history ?? [])
      .filter((p) => p.time >= cutoff)
      .map((p) => ({ date: p.time, value: p.value }));
    return {
      data: series,
      inflow: series.filter((d) => d.value > 0).length,
      outflow: series.filter((d) => d.value < 0).length,
    };
  }, [flows, cutoff]);

  // Only blank the card before the first history lands — a background refresh
  // keeps the grid on screen instead of flashing to a skeleton.
  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="min-h-0 flex-1">
        <CalendarHeatmap
          data={data}
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          // ETFs only trade on business days, so a Monday-anchored grid puts the
          // permanently empty weekend in two contiguous bottom rows instead of
          // splitting it across the top and bottom edge.
          weekStart="monday"
          formatValue={money.compact}
          legendLowLabel="outflow"
          legendHighLabel="inflow"
        />
      </div>
      {/* The control rides the caption row. The previous matrix heatmap had to
          reserve a slim row of its own above the grid, because its weekday
          labels were HTML spans sitting exactly where a top-right overlay would
          land; this grid draws its labels in SVG along the top and left, so the
          space is free again. */}
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] pt-1">
        <span className="caption text-soft min-w-0 truncate">
          {config.asset.toUpperCase()} ETF ·{" "}
          <span style={{ color: UP_COLOR }}>{inflow} in</span>
          {" / "}
          <span style={{ color: DOWN_COLOR }}>{outflow} out</span>
        </span>
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="ETF flow calendar lookback"
        />
      </div>
    </div>
  );
}

export const etfFlowCalendarFrame = defineFrame({
  ...etfFlowCalendarMeta,
  component: EtfFlowCalendar,
});
