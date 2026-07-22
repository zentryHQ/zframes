import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompactUsd, formatPct } from "./format";
import { volumeShareDonutMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = volumeShareDonutMeta.schema;

// Muted neutral for the "Other" bucket — the rolled-up tail isn't
// individually interesting, so it shouldn't compete with the ranked slices.
const OTHER_COLOR = "rgba(255, 255, 255, 0.22)";

function VolumeShareDonut({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useDayStatsState();

  const slices = useMemo(() => {
    const rows = Object.entries(stats)
      .map(([symbol, s]) => ({ symbol, vol: s.dayNtlVlm ?? 0 }))
      .filter((r) => r.vol > 0)
      .sort((a, b) => b.vol - a.vol);
    const top = rows.slice(0, config.limit);
    const rest = rows.slice(config.limit);
    const restVol = rest.reduce((sum, r) => sum + r.vol, 0);
    const named = top.map((r, i) => ({
      name: tickerOf(r.symbol),
      value: r.vol,
      color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
    }));
    if (restVol > 0)
      named.push({ name: "Other", value: restVol, color: OTHER_COLOR });
    return named;
  }, [stats, config.limit]);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (isLoading) return <FrameStatus loading>loading volume…</FrameStatus>;
  if (slices.length === 0) return <FrameStatus>no volume data yet</FrameStatus>;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <PieChart
        data={slices}
        width={200}
        height={200}
        innerRadius={58}
        outerRadius={92}
        colors={slices.map((s) => s.color)}
      >
        <div className="flex flex-col items-center gap-0.5">
          <span className="caption text-soft">24h volume</span>
          <span className="metric-lg text-strong">
            {formatCompactUsd(total)}
          </span>
        </div>
      </PieChart>

      <div className="flex w-full max-w-xs flex-wrap justify-center gap-x-5 gap-y-1.5">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="body-sm text-soft">{s.name}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {formatPct((s.value / total) * 100, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const volumeShareDonutFrame = defineFrame({
  ...volumeShareDonutMeta,
  component: VolumeShareDonut,
});
