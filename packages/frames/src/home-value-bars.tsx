import { BarChart } from "@zframes/charts";
import { defineFrame, useHomeValueIndex, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { homeValueBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = homeValueBarsMeta.schema;

function HomeValueBars({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const regions = useMemo(() => [...config.regions], [config.regions]);
  const { index, isLoading } = useHomeValueIndex(regions);

  const data = useMemo(
    () =>
      [...(index?.entries ?? [])]
        .sort((a, b) => b.value - a.value)
        .map((entry) => ({ label: entry.region, value: entry.value })),
    [index],
  );

  // Bar labels are converted but symbol-less (money.magnitude), the same
  // treatment every value axis gets — the card's currency is stated in the
  // caption instead of repeated on eleven bars.
  const formatValue = useMemo(
    () => (value: number) => money.magnitude(value),
    [money],
  );

  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading home values…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no home-value data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <BarChart
          data={data}
          orientation="horizontal"
          fill
          formatValue={formatValue}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        typical home value ({money.code}) · Zillow ZHVI
        {index?.asOf ? ` · ${index.asOf}` : ""}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const homeValueBarsFrame = defineFrame({
  ...homeValueBarsMeta,
  component: HomeValueBars,
});
