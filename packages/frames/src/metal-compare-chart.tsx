import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct } from "./format";
import {
  downsample,
  metalName,
  onSharedFixDays,
  rebaseToPct,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalCompareChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalCompareChartMeta.schema;

type Entry = { series: MultiSeriesData; totalPct: number };

function MetalCompareChart({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory(config.symbols);

  const entries: Entry[] = useMemo(() => {
    // Window, put every metal on the same fix days, THEN rebase — so all the
    // lines leave 0% on the same date and the totals below are comparable.
    // That's what lets $4,000 gold and $58 silver share one axis.
    const windows = onSharedFixDays(
      histories.map((history) => sliceYears(history.points, config.years)),
    );
    const out: Entry[] = [];
    windows.forEach((windowed, i) => {
      const rebased = downsample(rebaseToPct(windowed));
      if (rebased.length < 2) return;
      out.push({
        totalPct: rebased[rebased.length - 1].value,
        series: {
          id: histories[i].symbol,
          name: metalName(histories[i].symbol),
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
          data: toChartData(rebased),
        },
      });
    });
    return out;
  }, [histories, config.years]);

  // Stable array identity so the memoised chart doesn't re-render on every tick.
  const series = useMemo(() => entries.map((entry) => entry.series), [entries]);

  // Every line shares one start date (that's what onSharedFixDays buys), so it
  // can be named once instead of implied — a 58-year window over gold and
  // platinum actually starts in 1990, not 1968.
  const windowStart = useMemo(() => {
    const first = entries[0]?.series.data[0]?.date;
    return first
      ? new Date(first).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
      : "";
  }, [entries]);

  if (isLoading && entries.length === 0)
    return <FrameStatus loading>loading London fix history…</FrameStatus>;
  if (entries.length === 0)
    return (
      <FrameStatus>
        {histories.length > 1
          ? "no fix days these metals share in this window"
          : "no London fix history yet"}
      </FrameStatus>
    );

  // No summary strip: every line is rebased to 0% at the window start, so the
  // chart's own legend pill — which prints each series' LAST value — already IS
  // that metal's window return. A second strip beside it repeated the same four
  // numbers in a second style.
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <TimeSeriesChart
        series={series}
        timeframe={timeframeFor(config.years)}
        height={240}
        formatValue={formatChangePct}
      />
      <div className="caption text-soft text-center">
        indexed to 0% at {windowStart} · {config.years}y
      </div>
    </div>
  );
}

export const metalCompareChartFrame = defineFrame({
  ...metalCompareChartMeta,
  component: MetalCompareChart,
});
