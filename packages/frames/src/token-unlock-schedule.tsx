import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useTokenUnlocks } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatCompact, formatPct } from "./format";
import { timeframeFor, toChartData } from "./metals-shared";
import { tokenUnlockScheduleMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { FrameStatus } from "./ui";

const schema = tokenUnlockScheduleMeta.schema;

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

/**
 * "in 3 months" / "in 12 days" for a future timestamp.
 *
 * `durationSince` in metals-shared measures elapsed time, which is the wrong
 * direction for every date this frame cares about — an unlock is interesting
 * precisely because it has NOT happened.
 */
function inFuture(time: number, now: number): string {
  const days = Math.max(0, Math.round((time - now) / DAY_MS));
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 45) return `in ${days} days`;
  const months = Math.round(days / 30);
  if (months < 24) return `in ${months} months`;
  return `in ${(days / 365).toFixed(1)} years`;
}

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function TokenUnlockSchedule({ config }: { config: z.output<typeof schema> }) {
  const { unlocks, isLoading } = useTokenUnlocks(config.protocol);

  const { observed, scheduled, spanYears, upcoming, now } = useMemo(() => {
    const empty = {
      observed: [] as { date: string; value: number }[],
      scheduled: [] as { date: string; value: number }[],
      spanYears: 1,
      upcoming: [] as NonNullable<typeof unlocks>["upcoming"],
      now: Date.now(),
    };
    if (!unlocks) return empty;
    const points = unlocks.schedule;
    const nowMs = Date.now();
    // The boundary the publisher states, not "before now": a schedule can be
    // published with its last observation days behind the poll, and treating the
    // gap as observed would draw projection as history — the one thing this card
    // must never do. Fall back to now only when the field is absent.
    const boundary = unlocks.observedThrough ?? nowMs;

    const past = points.filter((p) => p.time <= boundary);
    const future = points.filter((p) => p.time > boundary);
    // The boundary point belongs to BOTH lines, so the two segments meet
    // instead of leaving a one-interval gap that reads as missing data.
    const bridged =
      past.length > 0 ? [past[past.length - 1], ...future] : future;

    const span =
      points.length > 1
        ? points[points.length - 1].time - points[0].time
        : YEAR_MS;

    return {
      observed: toChartData(past),
      scheduled: toChartData(bridged),
      spanYears: Math.max(0.25, span / YEAR_MS),
      upcoming: unlocks.upcoming
        .filter((e) => e.time > nowMs)
        .slice(0, config.events),
      now: nowMs,
    };
  }, [unlocks, config.events]);

  const series: MultiSeriesData[] = useMemo(() => {
    const out: MultiSeriesData[] = [];
    if (observed.length > 0)
      out.push({
        id: "observed",
        name: "unlocked",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: observed,
      });
    // A separate series rather than one line, so the legend itself says which
    // half is a forecast. Styling a segment differently is not something the
    // chart layer exposes.
    if (scheduled.length > 1)
      out.push({
        id: "scheduled",
        name: "scheduled",
        color: CHART_COLORS_MULTI_SERIES[3],
        data: scheduled,
      });
    return out;
  }, [observed, scheduled]);

  if (isLoading && !unlocks)
    return <FrameStatus loading>loading unlock schedule…</FrameStatus>;
  if (!unlocks)
    return (
      <FrameStatus>
        no published unlock schedule for “{config.protocol}” — that field wants
        a DeFiLlama protocol slug, and only some protocols publish emissions
      </FrameStatus>
    );

  const { insiderPctNow, insiderPctFinal, progressPct, maxSupply } = unlocks;
  const stillVesting =
    insiderPctFinal !== undefined &&
    insiderPctNow !== undefined &&
    insiderPctFinal > insiderPctNow;

  return (
    <ChartCard gap={2}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft truncate uppercase">
            {unlocks.protocol} insider share
          </div>
          <div
            className={`metric-lg leading-none tabular-nums ${
              insiderPctNow === undefined ? "text-disabled" : "text-strong"
            }`}
          >
            {insiderPctNow === undefined ? "—" : formatPct(insiderPctNow, 1)}
            {stillVesting && (
              <span className="body-md text-soft">
                {" → "}
                {formatPct(insiderPctFinal, 1)}
              </span>
            )}
          </div>
          <div className="caption text-soft mt-0.5 truncate">
            {progressPct === undefined
              ? "schedule progress unpublished"
              : `${formatPct(progressPct, 0)} through the documented schedule`}
            {maxSupply !== undefined && ` · ${formatCompact(maxSupply)} max`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="caption text-soft">next unlock</div>
          {upcoming.length === 0 ? (
            <div className="body-md text-disabled">none scheduled</div>
          ) : (
            <>
              <div className="body-md text-strong font-bold tabular-nums">
                {formatCompact(upcoming[0].tokens)}
              </div>
              <div className="caption text-soft">
                {inFuture(upcoming[0].time, now)}
              </div>
            </>
          )}
        </div>
      </div>

      {config.showChart && series.length > 0 && (
        // The chart is the card's only elastic element — the header and the
        // `config.events` rows below are content-sized and must stay legible —
        // so it takes the slack and gives it back as the list grows, rather
        // than pinning a floor the card can't shrink under.
        <ChartCard.Body>
          <TimeSeriesChart
            series={series}
            timeframe={timeframeFor(spanYears)}
            fill
            formatValue={formatCompact}
          />
        </ChartCard.Body>
      )}

      {upcoming.length === 0 ? (
        <ChartCard.Caption>
          nothing left on the documented schedule — the supply this publisher
          tracks is fully unlocked
        </ChartCard.Caption>
      ) : (
        <div className="flex flex-col gap-1">
          {upcoming.map((e) => (
            <div
              key={`${e.time}-${e.category}`}
              className="flex items-baseline justify-between gap-2"
            >
              <div className="min-w-0 truncate">
                <span className="body-sm text-normal">{e.category}</span>
                <span className="caption text-soft">
                  {" · "}
                  {isoDay(e.time)}
                  {e.unlockType ? ` · ${e.unlockType}` : ""}
                </span>
              </div>
              <div className="body-sm text-strong shrink-0 tabular-nums">
                {formatCompact(e.tokens)}
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

export const tokenUnlockScheduleFrame = defineFrame({
  ...tokenUnlockScheduleMeta,
  component: TokenUnlockSchedule,
});
