import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import {
  DOWN_COLOR_HEX,
  changeColor,
  formatCompact,
  formatPct,
} from "./format";
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
      <CardHeader align="start">
        <CardHeader.Main>
          <CardHeader.Eyebrow>unemployment rate</CardHeader.Eyebrow>
          {/* `ink="normal"`, not the sub-line's default `soft`: the
              publisher's own print date reads as data here. */}
          <CardHeader.Sub ink="normal">{latestRate.date}</CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Sub>monthly</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Value>{formatPct(latestRate.value, 1)}</CardHeader.Value>
          <CardHeader.Sub size="caption" className="mt-1">
            {unemployment.source} · U-3
          </CardHeader.Sub>
        </CardHeader.Main>
        {jobsChange !== null && payrollLatest && (
          <CardHeader.Aside>
            {/* `caps={false}`: this aside labels its figure in sentence case,
                where an eyebrow over a hero figure is upper. */}
            <CardHeader.Eyebrow caps={false}>
              nonfarm payrolls
            </CardHeader.Eyebrow>
            <CardHeader.Value tint={changeColor(jobsChange)}>
              {jobsChange >= 0 ? "+" : ""}
              {formatCompact(jobsChange * 1000)}
            </CardHeader.Value>
            <CardHeader.Sub className="mt-1 tabular-nums">
              {formatCompact(payrollLatest.value * 1000)} jobs
            </CardHeader.Sub>
          </CardHeader.Aside>
        )}
      </CardHeader>

      <MiniLineChart
        data={sparkline}
        width={210}
        height={44}
        color={DOWN_COLOR_HEX}
      />
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
