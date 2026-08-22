import { BarChart } from "@zframes/charts";
import { defineFrame, useShortVolume } from "@zframes/core";
import type { ShortVolumeEntry } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import { shortVolumeBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = shortVolumeBarsMeta.schema;

function formatShare(v: number) {
  return formatPct(v, 1);
}

function ShortVolumeBars({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useShortVolume(config.symbols);

  const bars = useMemo(() => {
    const present = config.symbols
      .map((symbol) => data[symbol])
      .filter((entry): entry is ShortVolumeEntry => Boolean(entry));
    present.sort((a, b) => b.shortPct - a.shortPct);
    return present.map((entry) => ({
      label: entry.symbol,
      value: entry.shortPct,
    }));
  }, [data, config.symbols]);

  if (isLoading)
    return <FrameStatus loading>loading short volume…</FrameStatus>;
  if (bars.length === 0)
    return <FrameStatus>no FINRA short-volume data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <BarChart
          data={bars}
          orientation="horizontal"
          fill
          formatValue={formatShare}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        % of reported volume sold short · FINRA, not short interest
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const shortVolumeBarsFrame = defineFrame({
  ...shortVolumeBarsMeta,
  component: ShortVolumeBars,
});
