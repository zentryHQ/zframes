import { BarChart } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { DOWN_COLOR, UP_COLOR, changeColor, formatChangePct } from "./format";
import { annualReturns, divergingBars, metalName } from "./metals-shared";
import { metalAnnualReturnsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalAnnualReturnsMeta.schema;

/** A fix printed in the last days of December closes out the calendar year. */
function closesTheYear(time: number): boolean {
  const d = new Date(time);
  return d.getUTCMonth() === 11 && d.getUTCDate() >= 24;
}

function MetalAnnualReturns({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);

  const { bars, upYears, downYears, avgPct, partialYear } = useMemo(() => {
    // The full fix history first — `annualReturns` needs the prior year's last
    // fix to produce the oldest bar, so the window is applied afterwards.
    const points = histories[0]?.points ?? [];
    const years = annualReturns(points).slice(-config.years);
    const up = years.filter((y) => y.pct >= 0).length;
    const avg =
      years.length > 0
        ? years.reduce((sum, y) => sum + y.pct, 0) / years.length
        : 0;
    // The newest bar is the current year's return *so far* whenever the history
    // stops before the December fix. It stays on the chart (it's the bar people
    // came for), but the caption flags it — an unmarked part-year bar reads as
    // a settled annual return and quietly skews the average beside it.
    const latest = points.at(-1);
    const newest = years.at(-1);
    const partial =
      latest !== undefined &&
      newest !== undefined &&
      newest.year === new Date(latest.time).getUTCFullYear() &&
      !closesTheYear(latest.time)
        ? newest.year
        : null;
    return {
      bars: divergingBars(
        years.map((y) => ({ label: String(y.year), value: y.pct })),
      ),
      upYears: up,
      downYears: years.length - up,
      avgPct: avg,
      partialYear: partial,
    };
  }, [histories, config.years]);

  // Only blank the card before the first fix history lands — a background
  // refresh keeps the bars on screen instead of flashing back to a skeleton.
  if (isLoading && bars.length === 0)
    return <FrameStatus loading>loading annual returns…</FrameStatus>;
  if (bars.length === 0)
    return <FrameStatus>no calendar-year returns yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1.5} className="text-normal">
      {/* Fills, unlike the horizontal bar lists that scroll: bars stand SIDE BY
          SIDE here, so height is the value axis rather than a row count — it can
          shrink with the card without costing a single bar its legibility. */}
      <ChartCard.Body>
        <BarChart
          data={bars}
          orientation="vertical"
          fill
          formatValue={formatChangePct}
          maxTickLabels={Math.min(bars.length, 12)}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        {metalName(config.symbol)} · {bars.length} calendar years
        {partialYear !== null ? ` (${partialYear} YTD)` : ""} ·{" "}
        <span style={{ color: UP_COLOR }}>{upYears} up</span> /{" "}
        <span style={{ color: DOWN_COLOR }}>{downYears} down</span> · avg{" "}
        <span style={{ color: changeColor(avgPct) }}>
          {formatChangePct(avgPct)}
        </span>
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalAnnualReturnsFrame = defineFrame({
  ...metalAnnualReturnsMeta,
  component: MetalAnnualReturns,
});
