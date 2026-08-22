import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useMiningPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { miningPoolsShareMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = miningPoolsShareMeta.schema;

const WINDOW_OPTIONS = ["24h", "3d", "1w", "1m"] as const;

function MiningPoolsShare({ config }: { config: z.output<typeof schema> }) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { pools, isLoading } = useMiningPools(chartWindow);

  const slices = useMemo(() => {
    const all = pools?.pools ?? [];
    const top = all.slice(0, config.topN);
    const rest = all.slice(config.topN);
    const named = top.map((p) => ({
      name: p.name,
      value: p.blockCount,
      sharePct: p.sharePct,
    }));
    const restBlocks = rest.reduce((sum, p) => sum + p.blockCount, 0);
    if (restBlocks > 0) {
      named.push({
        name: "Other",
        value: restBlocks,
        sharePct: rest.reduce((sum, p) => sum + p.sharePct, 0),
      });
    }
    return named.map((slice, i) => ({
      ...slice,
      color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
    }));
  }, [pools, config.topN]);

  const top3Share = useMemo(
    () =>
      [...slices]
        .filter((slice) => slice.name !== "Other")
        .sort((a, b) => b.sharePct - a.sharePct)
        .slice(0, 3)
        .reduce((sum, slice) => sum + slice.sharePct, 0),
    [slices],
  );

  if (isLoading) return <FrameStatus loading>loading pools…</FrameStatus>;
  if (slices.length === 0) return <FrameStatus>no mining data yet</FrameStatus>;

  return (
    // No existing header row to slot the toggle into — overlay it top-right
    // rather than adding a row that would shrink the donut.
    <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center gap-4">
      <TimeframeToggle
        options={WINDOW_OPTIONS}
        value={chartWindow}
        onChange={setChartWindow}
        label="mining pool window"
        className="absolute top-0 right-0 z-10"
      />
      <div className="min-h-0 w-full flex-1">
        {/* `fill` scales the ring to the card; width/height stay behind it as
            the reference box the radii keep their proportions against. */}
        <PieChart
          data={slices}
          fill
          width={188}
          height={188}
          innerRadius={54}
          outerRadius={86}
          colors={slices.map((slice) => slice.color)}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span className="caption text-soft uppercase">top 3</span>
            <span className="metric-lg text-strong leading-none">
              {formatPct(top3Share, 0)}
            </span>
          </div>
        </PieChart>
      </div>

      <SliceLegend>
        {slices.map((slice) => (
          <SliceLegend.Item
            key={slice.name}
            color={slice.color}
            label={slice.name}
          >
            {formatPct(slice.sharePct, 1)}
          </SliceLegend.Item>
        ))}
      </SliceLegend>
    </div>
  );
}

export const miningPoolsShareFrame = defineFrame({
  ...miningPoolsShareMeta,
  component: MiningPoolsShare,
});
