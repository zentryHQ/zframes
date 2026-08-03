import { CalendarHeatmap, type CalendarDatum } from "@zframes/charts";
import { defineFrame, useFundingHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { DOWN_COLOR, UP_COLOR, formatFundingPct } from "./format";
import { fundingCalendarMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = fundingCalendarMeta.schema;

const LOOKBACK_DAYS = { "1M": 31, "3M": 92, "6M": 183 } as const;
const LOOKBACK_OPTIONS = ["1M", "3M", "6M"] as const;

/** Local-midnight key for the day an hourly print belongs to. */
function dayKey(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function FundingCalendar({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  // Memoised on the window: `startTimeMs` is a fetch dependency, so a fresh
  // `Date.now()` each render would refetch continuously.
  const startTimeMs = useMemo(
    () => Date.now() - LOOKBACK_DAYS[lookback] * 86_400_000,
    [lookback],
  );
  const { history, isLoading } = useFundingHistory(
    [config.symbol],
    startTimeMs,
  );

  const { data, paying, receiving } = useMemo(() => {
    const points = history[config.symbol] ?? [];
    // Funding accrues hourly, so a day's cost is the SUM of its prints, not an
    // average — the figure a position actually paid over those 24 hours.
    const byDay = new Map<number, number>();
    for (const p of points) {
      const day = dayKey(p.time);
      byDay.set(day, (byDay.get(day) ?? 0) + p.fundingRate * 100);
    }
    const series: CalendarDatum[] = [...byDay]
      .sort((a, b) => a[0] - b[0])
      .map(([date, value]) => ({ date, value }));
    return {
      data: series,
      paying: series.filter((d) => d.value > 0).length,
      receiving: series.filter((d) => d.value < 0).length,
    };
  }, [history, config.symbol]);

  // Only blank the card before the first history lands — a background refresh
  // keeps the grid on screen instead of flashing to a skeleton.
  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading funding history…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no funding history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="min-h-0 flex-1">
        <CalendarHeatmap
          data={data}
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          weekStart={config.weekStart}
          formatValue={formatFundingPct}
          legendLowLabel="shorts pay"
          legendHighLabel="longs pay"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] pt-1">
        <span className="caption text-soft min-w-0 truncate">
          {tickerOf(config.symbol)} · daily funding ·{" "}
          <span style={{ color: UP_COLOR }}>{paying} longs pay</span>
          {" / "}
          <span style={{ color: DOWN_COLOR }}>{receiving} shorts pay</span>
        </span>
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="funding calendar lookback"
        />
      </div>
    </div>
  );
}

export const fundingCalendarFrame = defineFrame({
  ...fundingCalendarMeta,
  component: FundingCalendar,
});
