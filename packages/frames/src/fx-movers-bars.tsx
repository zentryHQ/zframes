import { BarChart } from "@zframes/charts";
import { defineFrame, useFxRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { fxMoversBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fxMoversBarsMeta.schema;

function FxMoversBars({ config }: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useFxRates(config.base, config.symbols);

  const data = useMemo(
    () =>
      [...rates]
        .sort((a, b) => b.changePct - a.changePct)
        .map((fx) => ({ label: fx.symbol, value: fx.changePct })),
    [rates],
  );

  if (isLoading) return <FrameStatus loading>loading FX rates…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no FX data yet</FrameStatus>;

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
        {config.base.toUpperCase()} FX movers · day change
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const fxMoversBarsFrame = defineFrame({
  ...fxMoversBarsMeta,
  component: FxMoversBars,
});
