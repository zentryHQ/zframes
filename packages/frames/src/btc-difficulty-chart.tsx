import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useNetworkHashrate } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatHashrate } from "./format";
import { btcDifficultyChartMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = btcDifficultyChartMeta.schema;

const WINDOWS = ["1y", "2y", "3y"] as const;

function BtcDifficultyChart({ config }: { config: z.output<typeof schema> }) {
  // Not named `window` — that would shadow the global inside a browser component.
  const [historyWindow, setHistoryWindow] = useFrameChoice(
    "window",
    config.window,
  );
  const { data, isLoading } = useNetworkHashrate(historyWindow);

  const sparkline = useMemo(
    () =>
      (data?.difficulty ?? []).map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.difficulty,
      })),
    [data?.difficulty],
  );

  if (isLoading) return <FrameStatus loading>loading difficulty…</FrameStatus>;
  if (!data) return <FrameStatus>no difficulty data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">network difficulty</div>
          <div className="metric-lg text-strong leading-none">
            {formatCompact(data.currentDifficulty)}
          </div>
        </div>
        <div className="text-right">
          <div className="body-md text-normal font-bold tabular-nums">
            {formatHashrate(data.currentHashrate)}
          </div>
          <div className="caption text-soft">hashrate</div>
        </div>
      </div>

      <MiniLineChart
        data={sparkline}
        width={320}
        height={54}
        color="hsl(var(--zf-accent-hue, 242) 85% 72%)"
      />

      {/* The static "past 1y" caption is now the control itself — same row, same
          height, but adjustable on the card. */}
      <div className="flex items-center justify-between gap-2">
        <span className="caption text-soft">past {historyWindow}</span>
        <TimeframeToggle
          options={WINDOWS}
          value={historyWindow}
          onChange={setHistoryWindow}
          label="difficulty history window"
        />
      </div>
    </div>
  );
}

export const btcDifficultyChartFrame = defineFrame({
  ...btcDifficultyChartMeta,
  component: BtcDifficultyChart,
});
