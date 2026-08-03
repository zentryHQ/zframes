import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useNetworkHashrate } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatHashrate } from "./format";
import { btcHashrateMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = btcHashrateMeta.schema;

const WINDOWS = ["1y", "2y", "3y"] as const;

function BtcHashrate({ config }: { config: z.output<typeof schema> }) {
  // Not named `window` — that would shadow the global inside a browser component.
  const [historyWindow, setHistoryWindow] = useFrameChoice(
    "window",
    config.window,
  );
  const { data, isLoading } = useNetworkHashrate(historyWindow);

  const sparkline = useMemo(
    () =>
      (data?.hashrates ?? []).map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.hashrate,
      })),
    [data?.hashrates],
  );

  if (isLoading) return <FrameStatus loading>loading hashrate…</FrameStatus>;
  if (!data) return <FrameStatus>no hashrate data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">network hashrate</div>
          <div className="metric-lg text-strong leading-none">
            {formatHashrate(data.currentHashrate)}
          </div>
        </div>
        <div className="text-right">
          <div className="body-md text-normal font-bold tabular-nums">
            {formatCompact(data.currentDifficulty)}
          </div>
          <div className="caption text-soft">difficulty</div>
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
          label="hashrate history window"
        />
      </div>
    </div>
  );
}

export const btcHashrateFrame = defineFrame({
  ...btcHashrateMeta,
  component: BtcHashrate,
});
