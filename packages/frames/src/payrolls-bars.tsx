import { BarChart } from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompact } from "./format";
import { payrollsBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = payrollsBarsMeta.schema;
const PAYROLLS_SERIES_ID = "CES0000000001"; // total nonfarm, thousands of jobs

function PayrollsBars({ config }: { config: z.output<typeof schema> }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 3; // extra year so the oldest displayed month still gets a prior-month delta
  const { series, isLoading } = useMacroSeries(
    PAYROLLS_SERIES_ID,
    startYear,
    endYear,
  );

  const data = useMemo(() => {
    const points = series?.points ?? [];
    return points
      .slice(1)
      .map((point, i) => ({
        label: point.date,
        value: point.value - points[i].value, // thousands of jobs, net change vs prior month
      }))
      .slice(-config.months);
  }, [series, config.months]);

  if (isLoading) return <FrameStatus loading>loading payrolls…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no payrolls data yet</FrameStatus>;

  const latest = data.at(-1)!;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={200}
        formatValue={(v) => formatCompact(v * 1000)}
        showValues={false}
        maxTickLabels={6}
      />
      <div className="caption text-soft text-center">
        nonfarm payrolls · monthly net change · latest{" "}
        {latest.value >= 0 ? "+" : ""}
        {formatCompact(latest.value * 1000)}
      </div>
    </div>
  );
}

export const payrollsBarsFrame = defineFrame({
  ...payrollsBarsMeta,
  component: PayrollsBars,
});
