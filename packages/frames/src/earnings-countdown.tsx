import { defineFrame, useEarningsHistory } from "@zframes/core";
import { useMemo, useRef } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { changeColor, formatChangePct, formatPrice } from "./format";
import { earningsCountdownMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { useCountdown } from "./use-countdown";

const schema = earningsCountdownMeta.schema;

const DAY = 86_400_000;

/**
 * Parse a bare `YYYY-MM-DD` as LOCAL midnight. `new Date("2026-05-20")` is
 * parsed as UTC per spec, so west of Greenwich the day-count comes out one
 * short — the same bug the chart event markers had to fix. Returns null for
 * anything that isn't a plain ISO date, so a malformed calendar entry reads as
 * "no date confirmed" rather than as `NaN` days.
 */
function localMidnight(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Local midnight of the day `ms` falls in — the countdown's own zero point. */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days from today to `targetMs`; negative once it's past.
 *  Rounded because a DST boundary makes one of those days 23 or 25 hours. */
function daysUntil(targetMs: number): number {
  return Math.round((targetMs - startOfLocalDay(Date.now())) / DAY);
}

/** "before open" / "after close"; null when the exchange hasn't said. */
function sessionLabel(time: string | undefined): string | null {
  if (time === "pre-market") return "before open";
  if (time === "after-hours") return "after close";
  return null;
}

/** An EPS with its sign outside the symbol: "-$0.30", not "$-0.3000" — see the
 *  same helper in `earnings-surprise`; {@link formatPrice} owns the rounding. */
function formatEps(value: number): string {
  return value < 0 ? `-${formatPrice(-value)}` : formatPrice(value);
}

function EarningsCountdown({ config }: { config: z.output<typeof schema> }) {
  const daysRef = useRef<HTMLSpanElement>(null);
  const { data, isLoading } = useEarningsHistory(config.symbol);

  const targetMs = useMemo(
    () => (data?.nextReportDate ? localMidnight(data.nextReportDate) : null),
    [data?.nextReportDate],
  );
  const days = targetMs === null ? null : daysUntil(targetMs);

  // The repo's shared 24fps tick rather than a per-card interval: it writes
  // textContent directly (no re-render) and is viewport-gated, and here it
  // exists purely so a card left open across local midnight rolls its own day
  // count over instead of waiting on the next six-hourly poll. The React render
  // below owns the wording; the tick only keeps the numeral honest, so it
  // clamps at zero rather than counting past the print. Hooks run
  // unconditionally — a null ref no-ops, which keeps the early returns safe.
  useCountdown({
    ref: daysRef,
    getRemainingMs: () =>
      targetMs === null ? 0 : targetMs - startOfLocalDay(Date.now()),
    format: (ms) => String(Math.max(0, Math.round(ms / DAY))),
  });

  const dateLabel = useMemo(
    () =>
      targetMs === null
        ? null
        : new Date(targetMs).toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
    [targetMs],
  );

  if (isLoading)
    return <FrameStatus loading>loading earnings schedule…</FrameStatus>;
  if (!data)
    return (
      <FrameStatus>
        no earnings schedule for “{tickerOf(config.symbol)}”
      </FrameStatus>
    );

  const session = sessionLabel(data.nextReportTime);
  const last = data.results[0];
  const lastSurprise =
    last?.surprisePct != null && Number.isFinite(last.surprisePct)
      ? last.surprisePct
      : null;

  // A confirmed date in the past is a stale calendar entry, not a countdown:
  // never guess the next one from the filing cadence — a wrong earnings date is
  // worse than an absent one.
  const stale = days !== null && days < 0;
  const counting = days !== null && days >= 0;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 text-center">
      <div className="caption text-soft truncate uppercase tracking-[0.12em]">
        {tickerOf(config.symbol)} · next earnings
      </div>

      {counting ? (
        days === 0 ? (
          <div className="metric-md text-strong">today</div>
        ) : (
          <div className="flex items-baseline justify-center gap-1.5">
            <span ref={daysRef} className="metric-lg text-strong">
              {days}
            </span>
            <span className="body-sm text-soft">
              {days === 1 ? "day" : "days"}
            </span>
          </div>
        )
      ) : (
        <div className="body-md text-normal">
          {stale ? "awaiting next date" : "no date confirmed yet"}
        </div>
      )}

      {counting && dateLabel ? (
        <div className="body-sm text-normal flex flex-wrap items-center justify-center gap-1.5">
          <span>{dateLabel}</span>
          {session && (
            <span className="caption text-soft rounded-full bg-white/[0.07] px-1.5 py-[2px] uppercase tracking-[0.08em]">
              {session}
            </span>
          )}
        </div>
      ) : (
        <div className="caption text-soft">
          {stale
            ? `last scheduled ${dateLabel}`
            : "the exchange has not published one"}
        </div>
      )}

      {last && (
        <div className="caption text-soft flex flex-wrap items-center justify-center gap-1.5 tabular-nums">
          <span>
            {last.fiscalQuarterEnd}: {formatEps(last.eps)}
          </span>
          {last.consensusEps != null && (
            <span>vs {formatEps(last.consensusEps)} est</span>
          )}
          {lastSurprise !== null && (
            <span
              className="font-bold"
              style={{ color: changeColor(lastSurprise) }}
            >
              {formatChangePct(lastSurprise)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const earningsCountdownFrame = defineFrame({
  ...earningsCountdownMeta,
  component: EarningsCountdown,
});
