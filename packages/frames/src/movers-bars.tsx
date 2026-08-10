import { BarChart } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { moversBarsMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = moversBarsMeta.schema;

const WINDOW_OPTIONS = ["1h", "24h", "7d", "30d"] as const;

function MoversBars({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();
  // Not named `window` — that would shadow the global inside a browser
  // component.
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);

  const data = useMemo(() => {
    const ranked = entries
      .filter(
        (e) =>
          Number.isFinite(e.changePct?.[chartWindow]) && e.volume24hUsd > 0,
      )
      .sort((a, b) => b.changePct[chartWindow] - a.changePct[chartWindow]);
    // Diverging chart: the N/2 biggest gainers (top) and N/2 biggest losers
    // (bottom), skipped when there aren't enough distinct entries.
    const half = Math.floor(config.limit / 2);
    const picked =
      ranked.length <= config.limit
        ? ranked
        : [...ranked.slice(0, half), ...ranked.slice(-half)];
    return picked.map((e) => ({
      label: e.symbol,
      value: e.changePct[chartWindow],
    }));
  }, [entries, chartWindow, config.limit]);

  if (isLoading) return <FrameStatus loading>loading movers…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      <div className="min-h-0 flex-1">
        <BarChart
          data={data}
          orientation="horizontal"
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          fill
          formatValue={formatChangePct}
        />
      </div>
      {/* The static "top movers · {window} change" caption is now the
          control itself — same row, same height, but adjustable. */}
      <div className="flex items-center justify-between gap-2">
        <span className="caption text-soft">
          top movers · {chartWindow} change
        </span>
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="movers window"
        />
      </div>
    </div>
  );
}

export const moversBarsFrame = defineFrame({
  ...moversBarsMeta,
  component: MoversBars,
});
