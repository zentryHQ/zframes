import { BarChart } from "@zframes/charts";
import { defineFrame, useShortVolume } from "@zframes/core";
import type { ShortVolumeEntry } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { shortVolumeBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = shortVolumeBarsMeta.schema;

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
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={bars}
        orientation="horizontal"
        height={Math.max(bars.length * 24, 96)}
        formatValue={(v) => formatPct(v, 1)}
      />
      <div className="caption text-soft text-center">
        % of reported volume sold short · FINRA, not short interest
      </div>
    </div>
  );
}

export const shortVolumeBarsFrame = defineFrame({
  ...shortVolumeBarsMeta,
  component: ShortVolumeBars,
});
