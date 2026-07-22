import { BarChart } from "@zframes/charts";
import { defineFrame, useReferenceRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd, formatPct } from "./format";
import { nyfedReferenceRateBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nyfedReferenceRateBarsMeta.schema;

function NyfedReferenceRateBars({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { rates, isLoading } = useReferenceRates();

  const data = useMemo(() => {
    const shown = rates.slice(0, config.limit);
    if (config.metric === "volume") {
      return shown
        .filter((r) => r.volumeInBillions !== undefined)
        .map((r) => ({ label: r.label, value: r.volumeInBillions! * 1e9 }));
    }
    return shown.map((r) => ({ label: r.label, value: r.rate }));
  }, [rates, config.limit, config.metric]);

  if (isLoading)
    return <FrameStatus loading>loading reference rates…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no reference-rate data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 26, 96)}
        formatValue={config.metric === "volume" ? formatCompactUsd : formatPct}
      />
    </div>
  );
}

export const nyfedReferenceRateBarsFrame = defineFrame({
  ...nyfedReferenceRateBarsMeta,
  component: NyfedReferenceRateBars,
});
