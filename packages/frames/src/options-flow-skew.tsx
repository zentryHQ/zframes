import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { optionsFlowSkewMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsFlowSkewMeta.schema;

/** Signed skew as a percentage: (a - b) / (a + b) * 100, 0 when both are 0. */
function skewPct(a: number, b: number): number {
  const total = a + b;
  return total > 0 ? ((a - b) / total) * 100 : 0;
}

function OptionsFlowSkew({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  const data: BarDatum[] = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "OI", value: skewPct(summary.callOi, summary.putOi) },
      {
        label: "Volume",
        value: skewPct(summary.callVolume, summary.putVolume),
      },
    ];
  }, [summary]);

  if (isLoading) return <FrameStatus loading>loading options…</FrameStatus>;
  if (!summary) return <FrameStatus>no options data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 28, 84)}
        formatValue={formatChangePct}
      />
      <div className="caption text-soft flex justify-between">
        <span style={{ color: UP_COLOR }}>call-skewed</span>
        <span>{config.currency} positioning vs flow</span>
        <span style={{ color: DOWN_COLOR }}>put-skewed</span>
      </div>
    </div>
  );
}

export const optionsFlowSkewFrame = defineFrame({
  ...optionsFlowSkewMeta,
  component: OptionsFlowSkew,
});
