import { BarChart } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { moversBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = moversBarsMeta.schema;

function MoversBars({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();
  const window = config.window;

  const data = useMemo(() => {
    const ranked = entries
      .filter(
        (e) => Number.isFinite(e.changePct?.[window]) && e.volume24hUsd > 0,
      )
      .sort((a, b) => b.changePct[window] - a.changePct[window]);
    // Diverging chart: the N/2 biggest gainers (top) and N/2 biggest losers
    // (bottom), skipped when there aren't enough distinct entries.
    const half = Math.floor(config.limit / 2);
    const picked =
      ranked.length <= config.limit
        ? ranked
        : [...ranked.slice(0, half), ...ranked.slice(-half)];
    return picked.map((e) => ({ label: e.symbol, value: e.changePct[window] }));
  }, [entries, window, config.limit]);

  if (isLoading) return <FrameStatus loading>loading movers…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 22, 96)}
        formatValue={formatChangePct}
      />
      <div className="caption text-soft text-center">
        top movers · {window} change
      </div>
    </div>
  );
}

export const moversBarsFrame = defineFrame({
  ...moversBarsMeta,
  component: MoversBars,
});
