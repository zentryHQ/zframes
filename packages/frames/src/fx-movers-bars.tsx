import { BarChart } from "@zframes/charts";
import { defineFrame, useFxRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
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
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      <div className="min-h-0 flex-1">
        <BarChart
          data={data}
          orientation="horizontal"
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          fill
          formatValue={formatChangePct}
        />
      </div>
      <div className="caption text-soft text-center">
        {config.base.toUpperCase()} FX movers · day change
      </div>
    </div>
  );
}

export const fxMoversBarsFrame = defineFrame({
  ...fxMoversBarsMeta,
  component: FxMoversBars,
});
