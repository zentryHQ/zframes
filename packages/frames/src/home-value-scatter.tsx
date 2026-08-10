import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useHomeValueIndex, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { homeValueScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = homeValueScatterMeta.schema;

function HomeValueScatter({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const regions = useMemo(() => [...config.regions], [config.regions]);
  const { index, isLoading } = useHomeValueIndex(regions);

  const data: ScatterDatum[] = useMemo(
    () =>
      (index?.entries ?? [])
        .filter((entry) => entry.changePctYoY !== undefined && entry.value > 0)
        .map((entry) => ({
          id: entry.region,
          label: entry.region,
          x: entry.changePctYoY as number,
          y: entry.value,
          weight: entry.value,
          color: changeColor(entry.changePctYoY as number),
        })),
    [index],
  );

  // Both formatters are D3 render callbacks, not components, so they close over
  // `money` rather than calling the hook themselves.
  const formatY = useMemo(
    () => (value: number) => money.magnitude(value),
    [money],
  );

  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading home values…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no home-value data yet</FrameStatus>;

  return (
    <div className="text-normal flex h-full min-h-0 flex-col justify-center gap-1">
      <div className="min-h-0 flex-1">
        <ScatterChart
          data={data}
          // Linear, deliberately. US metro home values span roughly $200k–$1.2M —
          // barely more than half a decade — and a log axis over less than one
          // decade puts most of its ticks in the top third of the plot, so the
          // labels crowd into an unreadable stack while buying no extra spread.
          // (Log earns its place on a range like chain transaction counts, which
          // cover several orders of magnitude.)
          fill
          zeroXLine
          formatX={formatChangePct}
          formatY={formatY}
          maxLabels={10}
        />
      </div>
      <div className="caption text-soft text-center">
        y/y change (x) vs typical home value (y, {money.code}) · right of the
        line = still appreciating
      </div>
    </div>
  );
}

export const homeValueScatterFrame = defineFrame({
  ...homeValueScatterMeta,
  component: HomeValueScatter,
});
