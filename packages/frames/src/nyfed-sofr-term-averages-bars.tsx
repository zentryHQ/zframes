import { BarChart } from "@zframes/charts";
import { defineFrame, useReferenceRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { nyfedSofrTermAveragesBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nyfedSofrTermAveragesBarsMeta.schema;

function NyfedSofrTermAveragesBars(_props: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useReferenceRates();
  const sofrai = rates.find((r) => r.code === "SOFRAI");

  const data = useMemo(() => {
    if (!sofrai) return [];
    return [
      { label: "30D", value: sofrai.average30Day },
      { label: "90D", value: sofrai.average90Day },
      { label: "180D", value: sofrai.average180Day },
    ].filter((d): d is { label: string; value: number } => d.value !== undefined);
  }, [sofrai]);

  if (isLoading)
    return <FrameStatus loading>loading SOFR averages…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no SOFR term-average data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart data={data} height={160} formatValue={formatPct} />
      <div className="caption text-soft text-center">
        SOFR compounded averages
      </div>
    </div>
  );
}

export const nyfedSofrTermAveragesBarsFrame = defineFrame({
  ...nyfedSofrTermAveragesBarsMeta,
  component: NyfedSofrTermAveragesBars,
});
