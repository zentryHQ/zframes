import { BarChart } from "@zframes/charts";
import { defineFrame, useIndexSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct } from "./format";
import { annualReturns, divergingBars } from "./metals-shared";
import { indexAnnualReturnsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = indexAnnualReturnsMeta.schema;

function IndexAnnualReturns({ config }: { config: z.output<typeof schema> }) {
  const { series, isLoading } = useIndexSeries(config.series);

  const data = useMemo(() => {
    const returns = annualReturns(series?.points ?? []).slice(-config.years);
    // divergingBars carries the semantic up/down pair, so gains and losses tint
    // themselves rather than each frame re-deciding what green means.
    return divergingBars(
      returns.map((r) => ({ label: String(r.year), value: r.pct })),
    );
  }, [series, config.years]);

  if (isLoading && !series)
    return <FrameStatus loading>loading index history…</FrameStatus>;
  // A calendar-year return needs two consecutive year-ends, so a series with
  // under ~a year of licensed history legitimately has nothing to show.
  if (data.length === 0)
    return <FrameStatus>no full calendar year yet</FrameStatus>;

  const positive = data.filter((d) => d.value >= 0).length;

  return (
    <div className="text-normal flex h-full min-h-0 flex-col justify-center gap-1">
      <BarChart
        data={data}
        fill
        formatValue={formatChangePct}
        showValues={false}
        maxTickLabels={12}
      />
      <div className="caption text-soft text-center">
        {series?.label} · {positive} up / {data.length - positive} down of{" "}
        {data.length} years
      </div>
    </div>
  );
}

export const indexAnnualReturnsFrame = defineFrame({
  ...indexAnnualReturnsMeta,
  component: IndexAnnualReturns,
});
