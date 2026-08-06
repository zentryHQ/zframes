import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMoney,
  useProtocolFundamentals,
  type SeriesPoint,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { downsample, timeframeFor, toChartData } from "./metals-shared";
import { protocolRevenueMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = protocolRevenueMeta.schema;

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

/** Blue for fees, green for revenue — green being the part the protocol kept. */
const FEES_COLOR = CHART_COLORS_MULTI_SERIES[0];
const REVENUE_COLOR = CHART_COLORS_MULTI_SERIES[1];

const LOOKBACK_YEARS = { "3M": 0.25, "1Y": 1, "3Y": 3, MAX: 100 } as const;
const LOOKBACK_OPTIONS = ["3M", "1Y", "3Y", "MAX"] as const;

/** UTC day index of an epoch-ms timestamp. The publisher prints UTC midnights,
 *  so this is the join key between the fee and revenue series. */
const dayKey = (time: number) => Math.floor(time / DAY_MS);

const lastTime = (points: readonly SeriesPoint[]) =>
  points.length > 0 ? points[points.length - 1].time : 0;

/**
 * Trailing-window total from a daily series — the fallback for when the
 * publisher omits its own aggregate.
 *
 * Anchored on the series' newest print rather than `Date.now()`: a protocol
 * whose adapter stopped publishing last month should still total its own last 30
 * days instead of reading as a confident zero.
 */
function trailingTotal(
  points: readonly SeriesPoint[],
  days: number,
): number | undefined {
  if (points.length === 0) return undefined;
  const since = lastTime(points) - (days - 1) * DAY_MS;
  let total = 0;
  for (const point of points) if (point.time >= since) total += point.value;
  return total;
}

/**
 * Revenue ÷ fees over the trailing year, derived from the daily series when the
 * publisher's own trailing totals are missing.
 *
 * Counts only the days BOTH lines print. The two series are independent grids of
 * different lengths — a live pair ran 2,833 fee days against 1,055 revenue days
 * — so pairing them positionally would divide this year's revenue by fees from
 * three years ago. Sharing days also stops a protocol that only began publishing
 * revenue three months ago from being measured against a full year of fees,
 * which understates its take rate instead of admitting the gap.
 */
function sharedDayTakeRate(
  fees: readonly SeriesPoint[],
  revenue: readonly SeriesPoint[],
  since: number,
): number | undefined {
  if (revenue.length === 0) return undefined;
  const revenueByDay = new Map<number, number>();
  for (const point of revenue)
    if (point.time >= since) revenueByDay.set(dayKey(point.time), point.value);
  let feeTotal = 0;
  let revenueTotal = 0;
  for (const point of fees) {
    if (point.time < since) continue;
    const kept = revenueByDay.get(dayKey(point.time));
    if (kept === undefined) continue;
    feeTotal += point.value;
    revenueTotal += kept;
  }
  return feeTotal > 0 ? revenueTotal / feeTotal : undefined;
}

/**
 * One aggregate column — the line's name, its headline figure, then two caption
 * rows.
 *
 * The `hint` row is load-bearing rather than decoration: "fees" and "revenue"
 * are routinely read as synonyms, and a card showing both without saying which
 * is which invites exactly the mistake of valuing a protocol off money it never
 * kept.
 */
function AggregateColumn({
  label,
  color,
  value,
  sub,
  hint,
}: {
  label: string;
  color?: string;
  value: string;
  sub: string;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="caption truncate font-semibold"
        style={color ? { color } : undefined}
      >
        {label}
      </div>
      <div className="metric-sm text-strong truncate">{value}</div>
      <div className="caption text-soft truncate">{sub}</div>
      <div className="caption text-soft truncate">{hint}</div>
    </div>
  );
}

function ProtocolRevenue({ config }: { config: z.output<typeof schema> }) {
  const { fundamentals, isLoading } = useProtocolFundamentals(config.protocol);
  const money = useMoney();
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);

  const fees = fundamentals?.fees ?? [];
  const revenue = fundamentals?.revenue ?? [];
  const showFees = config.show !== "revenue";
  const showRevenue = config.show !== "fees";

  const series: MultiSeriesData[] = useMemo(() => {
    // ONE cutoff for both lines, anchored on the newest day either publishes.
    // Windowing each against its own last print would give a protocol whose
    // revenue adapter stopped six months ago six months of extra revenue
    // history — two lines covering different spans of the same axis.
    const latest = Math.max(lastTime(fees), lastTime(revenue));
    if (latest === 0) return [];
    const cutoff = latest - LOOKBACK_YEARS[lookback] * YEAR_MS;
    const lines = [
      showFees && {
        id: "fees",
        name: "Fees · users paid",
        color: FEES_COLOR,
        points: fees,
      },
      showRevenue && {
        id: "revenue",
        name: "Revenue · protocol kept",
        color: REVENUE_COLOR,
        points: revenue,
      },
    ].filter((line): line is Exclude<typeof line, false> => line !== false);
    const out: MultiSeriesData[] = [];
    for (const line of lines) {
      // Thin after windowing: a 5,600-day fee history is far more points than a
      // D3 path can resolve.
      const windowed = downsample(
        line.points.filter((point) => point.time >= cutoff),
      );
      // One point draws no path — that's an empty chart shell, not a chart.
      if (windowed.length < 2) continue;
      out.push({
        id: line.id,
        name: line.name,
        color: line.color,
        data: toChartData(windowed),
      });
    }
    return out;
  }, [fees, revenue, showFees, showRevenue, lookback]);

  const takeRate = useMemo(() => {
    // Prefer the publisher's own trailing totals so the card agrees with
    // defillama.com; a genuine zero revenue365d is a fact, not a gap, so only a
    // null check guards it.
    if (
      fundamentals?.fees365d != null &&
      fundamentals.fees365d > 0 &&
      fundamentals.revenue365d != null
    )
      return fundamentals.revenue365d / fundamentals.fees365d;
    return sharedDayTakeRate(fees, revenue, Date.now() - YEAR_MS);
  }, [fundamentals, fees, revenue]);

  if (isLoading && !fundamentals)
    return <FrameStatus loading>loading protocol fees…</FrameStatus>;
  if (!fundamentals || fees.length === 0)
    return (
      <FrameStatus>
        no fee history for “{config.protocol}” — that field wants a DeFiLlama
        protocol slug, not a token ticker
      </FrameStatus>
    );
  if (config.show === "revenue" && revenue.length === 0)
    return (
      <FrameStatus>
        {fundamentals.name} publishes no revenue line — only total fees
      </FrameStatus>
    );

  const fees365 = fundamentals.fees365d ?? trailingTotal(fees, 365);
  const fees30 = fundamentals.fees30d ?? trailingTotal(fees, 30);
  // Absent revenue and zero revenue are different facts: a protocol that passes
  // every fee through publishes a real all-zero line, so only an EMPTY series
  // reads as "not published".
  const unpublished = revenue.length === 0;
  const revenue365 = unpublished
    ? undefined
    : (fundamentals.revenue365d ?? trailingTotal(revenue, 365));
  const revenue30 = unpublished
    ? undefined
    : (fundamentals.revenue30d ?? trailingTotal(revenue, 30));

  const amount = (value: number | undefined) =>
    value == null ? "—" : money.compact(value);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-3 gap-3">
        <AggregateColumn
          label="FEES · 1Y"
          color={FEES_COLOR}
          value={amount(fees365)}
          sub={`30d ${amount(fees30)}`}
          hint="what users paid"
        />
        <AggregateColumn
          label="REVENUE · 1Y"
          color={REVENUE_COLOR}
          value={unpublished ? "n/a" : amount(revenue365)}
          sub={unpublished ? "not published" : `30d ${amount(revenue30)}`}
          hint={unpublished ? "no revenue line" : "what the protocol kept"}
        />
        <AggregateColumn
          label="TAKE RATE"
          value={takeRate == null ? "—" : formatPct(takeRate * 100, 1)}
          sub={takeRate == null ? "needs both lines" : "of fees kept"}
          hint={
            takeRate == null
              ? "revenue unpublished"
              : "rest goes to LPs/stakers"
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        {series.length === 0 ? (
          <FrameStatus>no daily prints in this window</FrameStatus>
        ) : (
          <TimeSeriesChart
            series={series}
            timeframe={timeframeFor(LOOKBACK_YEARS[lookback])}
            fill
            formatValue={money.compact}
            control={
              <TimeframeToggle
                options={LOOKBACK_OPTIONS}
                value={lookback}
                onChange={setLookback}
                label="fees and revenue history window"
              />
            }
          />
        )}
      </div>
    </div>
  );
}

export const protocolRevenueFrame = defineFrame({
  ...protocolRevenueMeta,
  component: ProtocolRevenue,
});
