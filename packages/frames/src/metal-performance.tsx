import { BarChart } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct } from "./format";
import {
  cagrPct,
  divergingBars,
  metalName,
  pctChange,
  valueAtOrBefore,
} from "./metals-shared";
import { metalPerformanceMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalPerformanceMeta.schema;

/**
 * The standard horizon ladder. `years` is the nominal span used to annualise;
 * sub-year horizons carry `years < 1` and are dropped in annualised mode,
 * because compounding a one-month move to a yearly rate is noise dressed up as
 * a forecast. YTD has no fixed span — its reference is the prior year's last
 * fix — so it is marked separately.
 */
const HORIZONS: { label: string; months?: number; years: number }[] = [
  { label: "1M", months: 1, years: 1 / 12 },
  { label: "3M", months: 3, years: 0.25 },
  { label: "6M", months: 6, years: 0.5 },
  { label: "YTD", years: 0 },
  { label: "1Y", months: 12, years: 1 },
  { label: "5Y", months: 60, years: 5 },
  { label: "10Y", months: 120, years: 10 },
  { label: "20Y", months: 240, years: 20 },
];

/**
 * `n` calendar months before `time`, on the UTC calendar, with the day clamped
 * to the target month's length — a bare `setUTCMonth` on the 31st rolls forward
 * into the next month (Mar 31 − 1M → Mar 3), which would silently shorten the
 * horizon by a week.
 */
function monthsBefore(time: number, months: number): number {
  const d = new Date(time);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const daysInTargetMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, daysInTargetMonth));
  return d.getTime();
}

/** The last instant of the calendar year before `time` — the YTD reference. */
function priorYearEnd(time: number): number {
  return Date.UTC(new Date(time).getUTCFullYear() - 1, 11, 31, 23, 59, 59);
}

function MetalPerformance({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);
  const annualized = config.mode === "annualized";

  const bars = useMemo(() => {
    const points = histories[0]?.points ?? [];
    if (points.length === 0) return [];
    const latest = points[points.length - 1];

    const rows: { label: string; value: number }[] = [];
    for (const horizon of HORIZONS) {
      // Annualising anything shorter than a year is meaningless, so those
      // horizons are omitted rather than silently rescaled.
      if (annualized && horizon.years < 1) continue;
      const refTime =
        horizon.months === undefined
          ? priorYearEnd(latest.time)
          : monthsBefore(latest.time, horizon.months);
      const ref = valueAtOrBefore(points, refTime);
      // No fix that far back — skip the horizon instead of printing a 0%.
      if (ref === null || ref <= 0) continue;
      rows.push({
        label: horizon.label,
        value: annualized
          ? cagrPct(ref, latest.value, horizon.years)
          : pctChange(ref, latest.value),
      });
    }
    return divergingBars(rows);
  }, [histories, annualized]);

  // Only blank the card before the first fix history lands — a background
  // refresh keeps the ladder on screen instead of flashing back to a skeleton.
  if (isLoading && bars.length === 0)
    return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (bars.length === 0)
    return <FrameStatus>not enough fix history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      {/* Scrolls rather than shrinks: the height is a COUNT of bars, each
          needing its own row to stay readable, so a card shorter than the
          list should let you reach the rest rather than squash every bar. */}
      <div className={scrollAreaClass}>
        <BarChart
          data={bars}
          orientation="horizontal"
          height={Math.max(bars.length * 21, 96)}
          formatValue={formatChangePct}
        />
      </div>
      <div className="caption text-soft shrink-0 text-center">
        {metalName(config.symbol)} ·{" "}
        {annualized
          ? "compound annual rate · horizons under 1Y omitted"
          : "total return per horizon"}
      </div>
    </div>
  );
}

export const metalPerformanceFrame = defineFrame({
  ...metalPerformanceMeta,
  component: MetalPerformance,
});
