import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { inflationPulseMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = inflationPulseMeta.schema;
const CPI_SERIES_ID = "CUUR0000SA0";

function pointChangePct(current: number, previous: number | undefined) {
  if (!previous || previous <= 0) return null;
  return (current / previous - 1) * 100;
}

function InflationPulse({ config }: { config: z.output<typeof schema> }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 2;
  const { series, isLoading } = useMacroSeries(
    CPI_SERIES_ID,
    startYear,
    endYear,
  );

  const points = useMemo(
    () => (series?.points ?? []).slice(-config.months),
    [config.months, series?.points],
  );
  const latest = points.at(-1);
  const previous = points.at(-2);
  const yearAgo = latest
    ? points.find((point) => {
        const pointDate = new Date(point.time);
        const latestDate = new Date(latest.time);
        return (
          pointDate.getUTCFullYear() === latestDate.getUTCFullYear() - 1 &&
          pointDate.getUTCMonth() === latestDate.getUTCMonth()
        );
      })
    : undefined;

  const sparkline = useMemo(
    () =>
      points.map((point) => ({
        date: new Date(point.time).toISOString(),
        value: point.value,
      })),
    [points],
  );

  if (isLoading) return <FrameStatus loading>loading CPI…</FrameStatus>;
  if (!series || !latest) return <FrameStatus>no CPI data yet</FrameStatus>;

  const mom = pointChangePct(latest.value, previous?.value);
  const yoy = pointChangePct(latest.value, yearAgo?.value);
  const headline = yoy ?? mom ?? 0;
  const color = changeColor(headline);

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">BLS CPI-U</div>
          <div className="body-sm text-normal">{latest.date}</div>
        </div>
        <div className="caption text-soft text-right">monthly</div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div
            className="metric-xl leading-none"
            style={{ color, textShadow: `0 0 24px ${color}44` }}
          >
            {yoy !== null ? formatChangePct(yoy) : "--"}
          </div>
          <div className="caption text-soft mt-1">year over year</div>
        </div>
        <div className="text-right">
          <div className="caption text-soft">index</div>
          <div className="body-md text-strong font-bold tabular-nums">
            {latest.value.toFixed(3)}
          </div>
          <div className="caption text-soft mt-2">month over month</div>
          <div
            className="body-md font-bold tabular-nums"
            style={{ color: changeColor(mom ?? 0) }}
          >
            {mom !== null ? formatChangePct(mom) : "--"}
          </div>
        </div>
      </div>

      <MiniLineChart data={sparkline} width={210} height={46} color={color} />
      <div className="caption text-soft">
        {series.label} · {points.length} monthly observations
      </div>
    </div>
  );
}

export const inflationPulseFrame = defineFrame({
  ...inflationPulseMeta,
  component: InflationPulse,
});
