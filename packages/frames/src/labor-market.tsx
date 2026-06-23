import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, changeColor, formatCompact, formatPct } from "./format";
import { laborMarketMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = laborMarketMeta.schema;
const UNEMPLOYMENT_SERIES_ID = "LNS14000000"; // rate, percent
const PAYROLLS_SERIES_ID = "CES0000000001"; // total nonfarm, thousands of jobs

function LaborMarket({ config }: { config: z.output<typeof schema> }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 2;
  const { series: unemployment, isLoading: unemploymentLoading } =
    useMacroSeries(UNEMPLOYMENT_SERIES_ID, startYear, endYear);
  const { series: payrolls, isLoading: payrollsLoading } = useMacroSeries(
    PAYROLLS_SERIES_ID,
    startYear,
    endYear,
  );

  const unemploymentPoints = useMemo(
    () => (unemployment?.points ?? []).slice(-config.months),
    [config.months, unemployment?.points],
  );

  const sparkline = useMemo(
    () =>
      unemploymentPoints.map((point) => ({
        date: new Date(point.time).toISOString(),
        value: point.value,
      })),
    [unemploymentPoints],
  );

  if (unemploymentLoading && payrollsLoading)
    return <FrameStatus loading>loading labor data…</FrameStatus>;

  const latestRate = unemploymentPoints.at(-1);
  if (!unemployment || !latestRate)
    return <FrameStatus>no labor data yet</FrameStatus>;

  const payrollLatest = payrolls?.points.at(-1);
  const payrollPrev = payrolls?.points.at(-2);
  const jobsChange =
    payrollLatest && payrollPrev
      ? payrollLatest.value - payrollPrev.value
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">unemployment rate</div>
          <div className="body-sm text-normal">{latestRate.date}</div>
        </div>
        <div className="caption text-soft text-right">monthly</div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="metric-xl text-strong leading-none">
            {formatPct(latestRate.value, 1)}
          </div>
          <div className="caption text-soft mt-1">{unemployment.source} · U-3</div>
        </div>
        {jobsChange !== null && payrollLatest && (
          <div className="text-right">
            <div className="caption text-soft">nonfarm payrolls</div>
            <div
              className="body-md font-bold tabular-nums"
              style={{ color: changeColor(jobsChange) }}
            >
              {jobsChange >= 0 ? "+" : ""}
              {formatCompact(jobsChange * 1000)}
            </div>
            <div className="caption text-soft mt-1 tabular-nums">
              {formatCompact(payrollLatest.value * 1000)} jobs
            </div>
          </div>
        )}
      </div>

      <MiniLineChart data={sparkline} width={210} height={44} color={DOWN_COLOR} />
      <div className="caption text-soft">
        {unemployment.label} · {unemploymentPoints.length} monthly observations
      </div>
    </div>
  );
}

export const laborMarketFrame = defineFrame({
  ...laborMarketMeta,
  component: LaborMarket,
});
