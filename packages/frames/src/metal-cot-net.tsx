import {
  CHART_COLORS_MULTI_SERIES,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMetalPositioning } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompact } from "./format";
import {
  cotNet,
  downsample,
  metalName,
  rebaseToPct,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalCotNetMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalCotNetMeta.schema;

/** "23 Jul 2026" — the COT week is a dated print, matching the fix table. */
function formatWeek(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Contracts are a count, so they get the compact magnitude with an explicit
 *  sign: net positioning is only meaningful as "long by" or "short by". */
function signedContracts(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
}

function MetalCotNet({ config }: { config: z.output<typeof schema> }) {
  const { positioning, isLoading } = useMetalPositioning(config.symbol);

  const weeks = positioning?.weeks;

  // Window first, then thin — the shared metals transforms, so this frame's
  // window is the same window every other metals frame means by "5 years".
  // A 10-year weekly report is ~520 rows, more path than a few hundred pixels
  // can show.
  const { series, yDomain, netBase, latestNet, weekChange, lastReport } =
    useMemo(() => {
      const empty = {
        series: [] as MultiSeriesData[],
        yDomain: undefined as [number, number] | undefined,
        netBase: 0,
        latestNet: null as number | null,
        weekChange: null as number | null,
        lastReport: null as number | null,
      };
      const all = weeks ?? [];
      if (all.length === 0) return empty;

      const netPoints = downsample(
        sliceYears(
          all.map((w) => ({ time: w.time, value: cotNet(w) })),
          config.years,
        ),
      );
      if (netPoints.length === 0) return empty;

      // Net positioning is tens of thousands of contracts and open interest is
      // hundreds of thousands, so the overlay only compares if both are indexed
      // to the window start.
      const rebased = config.showOpenInterest;
      const built: MultiSeriesData[] = [
        {
          id: "net",
          name: "Net spec",
          color: CHART_COLORS_MULTI_SERIES[0],
          data: toChartData(rebased ? rebaseToPct(netPoints) : netPoints),
        },
      ];
      if (rebased) {
        // Same window, same thinning, so the two lines land on the same dates.
        const oiPoints = downsample(
          sliceYears(
            all.map((w) => ({ time: w.time, value: w.openInterest })),
            config.years,
          ),
        );
        built.push({
          id: "oi",
          name: "Open int",
          color: CHART_COLORS_MULTI_SERIES[2],
          data: toChartData(rebaseToPct(oiPoints)),
        });
      }
      // Zero has to stay on the axis — a net-position chart is read against it,
      // and gold's net has sat far above zero for years, so an auto domain would
      // crop the only reference line that matters. An explicit domain does that
      // without a fake flat series, which the chart would list in its legend as
      // a phantom "0" entry.
      const plotted = built.flatMap((s) => s.data.map((d) => d.value));
      const low = Math.min(0, ...plotted);
      const high = Math.max(0, ...plotted);
      const pad = (high - low) * 0.06 || 1;
      const yDomain: [number, number] = [low - pad, high + pad];

      // Week-over-week reads off the RAW rows: the thinning can drop the
      // penultimate report, and "vs last week" must mean last week.
      const last = all[all.length - 1];
      const prior = all.length > 1 ? all[all.length - 2] : null;
      return {
        series: built,
        yDomain,
        netBase: netPoints[0].value,
        latestNet: cotNet(last),
        weekChange: prior ? cotNet(last) - cotNet(prior) : null,
        lastReport: last.time,
      };
    }, [weeks, config.years, config.showOpenInterest]);

  if (isLoading && series.length === 0)
    return <FrameStatus loading>loading COT reports…</FrameStatus>;
  if (series.length === 0 || latestNet === null)
    return <FrameStatus>no COT positioning yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft uppercase">
            {metalName(config.symbol)} net spec
          </div>
          <div className="metric-lg text-strong leading-none tabular-nums">
            {signedContracts(latestNet)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="caption text-soft">week over week</div>
          {weekChange === null ? (
            <div className="body-md text-disabled">—</div>
          ) : (
            <div
              className="body-md font-bold tabular-nums"
              style={{ color: changeColor(weekChange) }}
            >
              {signedContracts(weekChange)}
            </div>
          )}
          {lastReport !== null && (
            <div className="caption text-soft">{formatWeek(lastReport)}</div>
          )}
        </div>
      </div>

      <MultiSeriesLineChart
        series={series}
        timeframe={timeframeFor(config.years)}
        height={180}
        yDomain={yDomain}
        formatValue={config.showOpenInterest ? formatChangePct : formatCompact}
      />

      <div className="caption text-soft text-center">
        {config.showOpenInterest ? (
          <>
            net spec and total open interest, both rebased to % from the window
            start
            {netBase <= 0 &&
              " · specs were net short there, so their % reads inverted"}
          </>
        ) : (
          "non-commercial long − short, contracts — zero is kept on the axis"
        )}
      </div>
    </div>
  );
}

export const metalCotNetFrame = defineFrame({
  ...metalCotNetMeta,
  component: MetalCotNet,
});
