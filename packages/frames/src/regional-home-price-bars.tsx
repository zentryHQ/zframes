import { BarChart } from "@zframes/charts";
import { defineFrame, useRegionalHousingPrice } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { regionalHomePriceBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = regionalHomePriceBarsMeta.schema;

function RegionalHomePriceBars({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const regions = useMemo(() => [...config.regions], [config.regions]);
  const { housing, isLoading } = useRegionalHousingPrice(regions, config.level);

  const data = useMemo(
    () =>
      (housing?.series ?? [])
        // Year-over-year needs five quarters; a region with less is skipped
        // rather than drawn as a flat 0% bar.
        .filter((entry) => entry.changePctYoY !== undefined)
        .map((entry) => ({
          label: entry.region,
          value: entry.changePctYoY as number,
        }))
        .sort((a, b) => b.value - a.value),
    [housing],
  );

  if (isLoading && !housing)
    return <FrameStatus loading>loading FHFA house-price index…</FrameStatus>;
  if (data.length === 0)
    return (
      <FrameStatus>
        {housing && housing.series.length === 0
          ? `no ${config.level} matched those regions`
          : "no regional house-price data yet"}
      </FrameStatus>
    );

  const period = housing?.series[0]?.period;
  const rising = data.filter((d) => d.value >= 0).length;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <BarChart
          data={data}
          orientation="horizontal"
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          fill
          formatValue={formatChangePct}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        FHFA HPI y/y · {config.level} · {rising} rising / {data.length - rising}{" "}
        falling
        {period ? ` · ${period}` : ""}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const regionalHomePriceBarsFrame = defineFrame({
  ...regionalHomePriceBarsMeta,
  component: RegionalHomePriceBars,
});
