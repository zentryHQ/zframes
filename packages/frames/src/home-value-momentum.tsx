import { BarChart } from "@zframes/charts";
import { defineFrame, useHomeValueIndex } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { homeValueMomentumMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = homeValueMomentumMeta.schema;

function HomeValueMomentum({ config }: { config: z.output<typeof schema> }) {
  const regions = useMemo(() => [...config.regions], [config.regions]);
  const { index, isLoading } = useHomeValueIndex(regions);

  const data = useMemo(
    () =>
      (index?.entries ?? [])
        // A metro with under a year of published history has no year-over-year
        // change; plotting it as a 0% bar would assert something false.
        .filter((entry) => entry.changePctYoY !== undefined)
        .map((entry) => ({
          label: entry.region,
          value: entry.changePctYoY as number,
        }))
        .sort((a, b) => b.value - a.value),
    [index],
  );

  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading home values…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no year-over-year data yet</FrameStatus>;

  const rising = data.filter((d) => d.value >= 0).length;

  return (
    <div className="text-normal flex h-full min-h-0 flex-col justify-center gap-1">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={formatChangePct}
      />
      <div className="caption text-soft text-center">
        year-over-year home value · {rising} rising / {data.length - rising}{" "}
        falling
      </div>
    </div>
  );
}

export const homeValueMomentumFrame = defineFrame({
  ...homeValueMomentumMeta,
  component: HomeValueMomentum,
});
