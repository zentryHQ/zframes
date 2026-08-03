import { defineFrame, useIndexSeries } from "@zframes/core";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL } from "./cycle-shared";
import { changeColor, formatChangePct, formatLevel } from "./format";
import { indexLevelMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = indexLevelMeta.schema;

function IndexLevel({ config }: { config: z.output<typeof schema> }) {
  const { series, isLoading } = useIndexSeries(config.series);

  if (isLoading && !series)
    return <FrameStatus loading>loading index level…</FrameStatus>;
  if (!series || series.points.length === 0)
    return <FrameStatus>no index data yet</FrameStatus>;

  const dirColor = changeColor(series.change);
  return (
    <MetricGauge
      caption={series.label}
      headline={formatLevel(series.latest)}
      // The level itself carries no valuation meaning (an index is just a
      // level), so the numeral stays neutral and only the move is tinted.
      headlineColor={ZONE_NEUTRAL}
      zone={{
        label: series.change >= 0 ? "Up" : "Down",
        color: dirColor,
      }}
      sub={`${formatChangePct(series.change)} · ${series.date}`}
      sparkline={series.points.slice(-config.trendDays)}
      sparkColor={dirColor}
    />
  );
}

export const indexLevelFrame = defineFrame({
  ...indexLevelMeta,
  component: IndexLevel,
});
