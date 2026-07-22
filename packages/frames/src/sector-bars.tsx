import { BarChart } from "@zframes/charts";
import { defineFrame, useSectorPerformance } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { sectorBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = sectorBarsMeta.schema;

function SectorBars({ config }: { config: z.output<typeof schema> }) {
  const { sectors, isLoading } = useSectorPerformance();

  const data = useMemo(
    () =>
      [...sectors]
        .sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h))
        .slice(0, config.limit)
        .sort((a, b) => b.changePct24h - a.changePct24h)
        .map((s) => ({ label: s.name, value: s.changePct24h })),
    [sectors, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading sectors…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no sector data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={formatChangePct}
      />
    </div>
  );
}

export const sectorBarsFrame = defineFrame({
  ...sectorBarsMeta,
  component: SectorBars,
});
