import { defineFrame, useSectorPerformance } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { MetricRow } from "./metric-row";
import { sectorPerformanceMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = sectorPerformanceMeta.schema;

function SectorPerformance({ config }: { config: z.output<typeof schema> }) {
  const { sectors, isLoading } = useSectorPerformance();
  const rows = sectors.slice(0, config.limit);

  if (isLoading) return <FrameStatus loading>loading sectors…</FrameStatus>;
  if (rows.length === 0) return <FrameStatus>no sector data yet</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {rows.map((s, i) => (
        <MetricRow
          key={i}
          label={s.name}
          meta={formatCompactUsd(s.marketCap)}
          value={
            <span style={{ color: changeColor(s.changePct24h) }}>
              {formatChangePct(s.changePct24h)}
            </span>
          }
        />
      ))}
    </div>
  );
}

export const sectorPerformanceFrame = defineFrame({
  ...sectorPerformanceMeta,
  component: SectorPerformance,
});
