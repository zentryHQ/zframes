import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMacroReferenceSeries,
  useMetalHistory,
  useMoney,
  type SeriesPoint,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatPct } from "./format";
import {
  downsample,
  durationSince,
  metalName,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalRealPriceMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalRealPriceMeta.schema;

/** Headline CPI (all urban consumers, all items), monthly back to 1947-01. */
const CPI_SERIES = "CPIAUCSL";

/** One fix day carrying both its published price and its deflated twin. */
type RealPoint = { time: number; nominal: number; real: number };

/**
 * Deflate a daily nominal price series by a monthly CPI index, expressed in
 * **today's dollars**: `real(t) = nominal(t) × CPI(latest) / CPI(t)`.
 *
 * Three choices, each silent if wrong:
 *
 *  - **The base period is the latest CPI print.** So the newest real point
 *    equals the newest nominal fix, and every older one reads as "what that
 *    price would be in today's money" — the question the card is asked. Basing
 *    on CPI's own 1982–84 = 100 instead would restate every number on the card
 *    while looking just as plausible.
 *  - **CPI is carried forward as a STEP, not interpolated.** It is a monthly
 *    published print, not a continuous process: every day of July is deflated by
 *    July's CPI, and the days after the last print (CPI lands a fortnight into
 *    the following month) keep using it. A daily interpolation would invent an
 *    inflation path nobody published and move the headline this card exists to
 *    quote.
 *  - **Fix days before the first CPI observation are dropped**, not deflated by
 *    the earliest print — there is no deflator for them. In practice CPI (1947)
 *    outruns even gold's fix history (1968), so this bites only if the CPI
 *    response is truncated.
 *
 * Both legs come back on ONE date grid on purpose: the line chart combines its
 * series by exact date and fills a date a series doesn't carry with 0, so a
 * nominal line sampled on its own days would print "$0" wherever the real line
 * had no twin.
 */
function deflateToTodaysDollars(
  nominal: readonly SeriesPoint[],
  cpi: readonly SeriesPoint[],
): RealPoint[] {
  if (nominal.length === 0 || cpi.length === 0) return [];
  const latestCpi = cpi[cpi.length - 1].value;
  if (latestCpi <= 0) return [];

  const out: RealPoint[] = [];
  // Both series are oldest→newest, so the CPI months advance alongside the fix
  // days in a single pass rather than a lookup per day over ~14,600 days.
  let month = 0;
  let deflator: number | null = null;
  for (const p of nominal) {
    while (month < cpi.length && cpi[month].time <= p.time) {
      deflator = cpi[month].value;
      month += 1;
    }
    if (deflator === null || deflator <= 0) continue;
    out.push({
      time: p.time,
      nominal: p.value,
      real: (p.value * latestCpi) / deflator,
    });
  }
  return out;
}

function MetalRealPrice({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  // The USD fix series specifically: CPI is a US index, so deflating a sterling
  // or euro fix with it would mix two countries' inflation.
  const { histories, isLoading: fixLoading } = useMetalHistory([config.symbol]);
  const { series: cpi, isLoading: cpiLoading } =
    useMacroReferenceSeries(CPI_SERIES);

  const fixes = useMemo(
    () => histories.find((h) => h.symbol === config.symbol)?.points ?? [],
    [histories, config.symbol],
  );

  const view = useMemo(() => {
    if (!cpi) return null;
    // Deflate the FULL history before windowing. The real all-time high is the
    // headline, and "all-time" measured inside a 20-year window would quietly
    // become the window's own high — which is precisely how the 1980 peak, the
    // reason this card exists, would go missing.
    const real = deflateToTodaysDollars(fixes, cpi.points);
    if (real.length < 2) return null;

    let peak = real[0];
    for (const p of real) if (p.real > peak.real) peak = p;
    const latest = real[real.length - 1];

    // `sliceYears` is the shared metals window, so "20 years" spans the same
    // dates here as on every sibling card — but it speaks `SeriesPoint`, and
    // these are triples. Window a projection to learn the cutoff day, then keep
    // the triples from it, so both legs stay on the one grid.
    const cutoff =
      sliceYears(
        real.map((p) => ({ time: p.time, value: p.real })),
        config.years,
      )[0]?.time ?? 0;
    const windowed = downsample(real.filter((p) => p.time >= cutoff));
    // One point draws no path — an empty chart shell, not a chart.
    if (windowed.length < 2) return null;

    const series: MultiSeriesData[] = [
      {
        id: "real",
        name: `${metalName(config.symbol)} · today's money`,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(
          windowed.map((p) => ({ time: p.time, value: p.real })),
        ),
      },
    ];
    if (config.showNominal)
      series.push({
        id: "nominal",
        name: "as published",
        color: CHART_COLORS_MULTI_SERIES[2],
        data: toChartData(
          windowed.map((p) => ({ time: p.time, value: p.nominal })),
        ),
      });

    return {
      series,
      latest,
      peak,
      // Negative below the record, 0 at it — the same sign convention as
      // `metal-drawdown`, so the two cards read the same way side by side.
      belowPeak: ((latest.real - peak.real) / peak.real) * 100,
    };
  }, [fixes, cpi, config.years, config.showNominal, config.symbol]);

  // Two capabilities, so "one leg arrived and the other hasn't" is the ordinary
  // first paint, not an edge case — name the leg still missing.
  if (!view) {
    if (fixLoading || cpiLoading)
      return (
        <FrameStatus loading>
          loading {fixes.length === 0 ? "London fix history" : "CPI"}…
        </FrameStatus>
      );
    return (
      <FrameStatus>
        {fixes.length === 0
          ? "no London fix history yet"
          : "no CPI history to deflate the fix with yet"}
      </FrameStatus>
    );
  }

  const { series, latest, peak, belowPeak } = view;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft truncate uppercase">
            {metalName(config.symbol)} in today's money
          </div>
          <div className="metric-lg text-strong leading-none tabular-nums">
            {money.price(latest.real)}
          </div>
          <div className="caption text-soft tabular-nums">
            {money.price(latest.nominal)} as published
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="caption text-soft uppercase">below real record</div>
          <div
            className="metric-sm tabular-nums"
            style={{ color: changeColor(belowPeak) }}
          >
            {formatPct(belowPeak, 1)}
          </div>
          <div className="caption text-soft tabular-nums">
            {money.price(peak.real)} · {new Date(peak.time).getUTCFullYear()}
          </div>
          <div className="caption text-soft">
            {durationSince(peak.time)} ago
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={money.price}
        />
      </div>
    </div>
  );
}

export const metalRealPriceFrame = defineFrame({
  ...metalRealPriceMeta,
  component: MetalRealPrice,
});
