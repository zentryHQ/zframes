import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMetalPositioning,
  type CotConcentration,
  type CotDisaggregated,
  type CotTraderClass,
  type CotWeek,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatPct } from "./format";
import { MetricRow } from "./metric-row";
import {
  downsample,
  durationSince,
  metalName,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalCotConcentrationMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalCotConcentrationMeta.schema;

/**
 * How few hands hold the market — the CFTC's concentration columns, which only
 * the disaggregated report carries.
 *
 * Gold routinely runs above half of its gross shorts in four traders, and
 * nothing else in the fleet shows concentration for any asset class: this is the
 * closest a commodity gets to reading an equity's 13F ownership table.
 */

/** "23 Jul 2026" — the reported Tuesday, matching the rest of the metals family. */
function formatWeek(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole percents on the axis — module-level so the identity is stable: the
 *  chart's redraw effect watches `formatValue`, and a fresh arrow per render
 *  rebuilds the whole plot on every poll. */
const formatSharePct = (value: number) => formatPct(value, 0);

type Reading = {
  key: string;
  label: string;
  /** Which side of the book — drives the semantic tint, as on the COT bars. */
  side: "long" | "short";
  /** How many traders the reading counts — 4 or 8. */
  traders: 4 | 8;
  pick: (c: CotConcentration) => number | undefined;
};

/**
 * Gross counts a trader's long and short books separately; net nets them first,
 * so net ≤ gross always. Gross is what "four traders hold 51% of the shorts"
 * means in the wild, and it's the pair the CFTC always publishes — the net
 * columns are optional in the shape and genuinely absent for some markets.
 */
const READINGS: Record<"gross" | "net", Reading[]> = {
  gross: [
    {
      key: "long4",
      label: "Top 4 longs",
      side: "long",
      traders: 4,
      pick: (c) => c.grossLong4,
    },
    {
      key: "short4",
      label: "Top 4 shorts",
      side: "short",
      traders: 4,
      pick: (c) => c.grossShort4,
    },
    {
      key: "long8",
      label: "Top 8 longs",
      side: "long",
      traders: 8,
      pick: (c) => c.grossLong8,
    },
    {
      key: "short8",
      label: "Top 8 shorts",
      side: "short",
      traders: 8,
      pick: (c) => c.grossShort8,
    },
  ],
  net: [
    {
      key: "long4",
      label: "Top 4 longs",
      side: "long",
      traders: 4,
      pick: (c) => c.netLong4,
    },
    {
      key: "short4",
      label: "Top 4 shorts",
      side: "short",
      traders: 4,
      pick: (c) => c.netShort4,
    },
    {
      key: "long8",
      label: "Top 8 longs",
      side: "long",
      traders: 8,
      pick: (c) => c.netLong8,
    },
    {
      key: "short8",
      label: "Top 8 shorts",
      side: "short",
      traders: 8,
      pick: (c) => c.netShort8,
    },
  ],
};

/** Trader counts are per class, so the card names the classes the disaggregated
 *  report names — the same wording as the disaggregated breakdown frame. */
const CLASSES: {
  key: string;
  label: string;
  pick: (d: CotDisaggregated) => CotTraderClass;
}[] = [
  {
    key: "producer",
    label: "Producers & merchants",
    pick: (d) => d.producerMerchant,
  },
  { key: "swap", label: "Swap dealers", pick: (d) => d.swapDealer },
  { key: "managed", label: "Managed money", pick: (d) => d.managedMoney },
  { key: "other", label: "Other reportables", pick: (d) => d.otherReportable },
];

/**
 * Only the weeks that actually carry a disaggregated report WITH concentration.
 *
 * The disaggregated series starts 2006-06-13 and the legacy one runs decades
 * further back, so a long window is mixed; reading through an absent report
 * would draw a zero where the CFTC published nothing, and 0% concentration is a
 * plausible-looking number rather than an obvious hole.
 */
function concentrationWeeks(
  weeks: readonly CotWeek[] | undefined,
): { time: number; report: CotDisaggregated; conc: CotConcentration }[] {
  const out: {
    time: number;
    report: CotDisaggregated;
    conc: CotConcentration;
  }[] = [];
  for (const week of weeks ?? []) {
    const report = week.disaggregated;
    if (report?.concentration)
      out.push({ time: week.time, report, conc: report.concentration });
  }
  return out;
}

/**
 * One concentration reading as a share of the whole market.
 *
 * The track matters as much as the fill: the question is what fraction of a
 * hundred percent sits in four hands, and a `BarChart` would scale to its own
 * largest bar, drawing 51% full-width — visually identical to 99%.
 */
function ShareRow({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="body-sm text-normal truncate font-semibold">
          {label}
        </span>
        <span className="metric-sm text-strong tabular-nums">
          {formatPct(pct, 1)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MetalCotConcentration({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { positioning, isLoading } = useMetalPositioning(config.symbol);

  const weeks = useMemo(
    () => concentrationWeeks(positioning?.weeks),
    [positioning],
  );
  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const readings: Reading[] = READINGS[config.basis];

  /** The readings the chosen basis actually has this week. Net is optional in
   *  the report, so an empty list here is a real state, not a bug. */
  const present = useMemo(() => {
    if (!latest) return [];
    return readings.flatMap((r) => {
      const value = r.pick(latest.conc);
      return value === undefined ? [] : [{ reading: r, value }];
    });
  }, [latest, readings]);

  /**
   * Headline: the more concentrated SIDE of the 4-trader pair — usually the
   * shorts in gold and silver.
   *
   * Restricted to the 4-trader readings on purpose. Top-8 concentration is ≥
   * top-4 by construction (it's the same four traders plus four more), so a plain
   * max over all four readings would pick an 8-trader figure every single week
   * and the headline would never say anything. Falls back to the 8s only when the
   * report omits the 4s.
   */
  const peak = useMemo(() => {
    if (present.length === 0) return null;
    const four = present.filter((p) => p.reading.traders === 4);
    const pool = four.length > 0 ? four : present;
    return pool.reduce((a, b) => (b.value > a.value ? b : a));
  }, [present]);

  const counts = useMemo(() => {
    if (!latest) return [];
    return CLASSES.flatMap((c) => {
      const t = c.pick(latest.report);
      if (t.tradersLong === undefined && t.tradersShort === undefined)
        return [];
      return [
        {
          key: c.key,
          label: c.label,
          long: t.tradersLong,
          short: t.tradersShort,
        },
      ];
    });
  }, [latest]);

  const history = useMemo(() => {
    if (!config.showHistory) return null;
    const window = weeks.slice(-config.weeks);
    if (window.length < 2) return null;

    // Per reading, only the weeks that published it — the net columns can start
    // later than the gross ones, so one missing series must not truncate the
    // others.
    const series: MultiSeriesData[] = readings.flatMap((r, i) => {
      const points = window.flatMap((w) => {
        const value = r.pick(w.conc);
        return value === undefined ? [] : [{ time: w.time, value }];
      });
      if (points.length < 2) return [];
      return [
        {
          id: r.key,
          name: r.label.replace("Top ", "T"),
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
          data: toChartData(downsample(points)),
        },
      ];
    });
    if (series.length === 0) return null;

    // A share is read against zero and capped at the whole market, so the domain
    // is anchored rather than auto-fitted — otherwise a flat 51% line looks like
    // a wildly volatile series.
    const plotted = series.flatMap((s) => s.data.map((d) => d.value));
    const high = Math.min(100, Math.max(...plotted) * 1.1);
    return {
      series,
      yDomain: [0, high] as [number, number],
      // Weeks is what the config asks for; the axis granularity wants years.
      years: window.length / 52,
      count: window.length,
    };
  }, [weeks, readings, config.showHistory, config.weeks]);

  if (isLoading && !latest)
    return <FrameStatus loading>loading COT concentration…</FrameStatus>;
  if (!latest)
    return (
      <FrameStatus>
        no COT concentration for {metalName(config.symbol)} — only the
        CFTC&apos;s disaggregated report carries it, and that either starts
        after this window (June 2006) or didn&apos;t land on this poll.
      </FrameStatus>
    );
  if (present.length === 0)
    return (
      <FrameStatus>
        {config.basis === "net"
          ? "net concentration isn't published for this market — set this card to gross, which the CFTC always reports."
          : "this week's report carries no concentration columns."}
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft uppercase">
            {metalName(config.symbol)} · {config.basis} concentration
          </div>
          {peak && (
            <div className="body-sm text-normal truncate">
              <span className="metric-md text-strong tabular-nums">
                {formatPct(peak.value, 1)}
              </span>{" "}
              in {peak.reading.label.toLowerCase()}
            </div>
          )}
        </div>
        <div className="caption text-soft shrink-0 text-right">
          <div>{formatWeek(latest.time)}</div>
          <div>{durationSince(latest.time)} old</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {present.map(({ reading, value }) => (
          <ShareRow
            key={reading.key}
            label={reading.label}
            pct={value}
            color={reading.side === "long" ? UP_COLOR : DOWN_COLOR}
          />
        ))}
      </div>

      {history && (
        <TimeSeriesChart
          series={history.series}
          timeframe={timeframeFor(history.years)}
          height={150}
          yDomain={history.yDomain}
          formatValue={formatSharePct}
        />
      )}

      {counts.length > 0 && (
        <div className={scrollAreaClass}>
          {latest.report.totalTraders !== undefined && (
            <MetricRow
              label="All reporting traders"
              meta="distinct traders above the reporting threshold"
              value={
                <span className="tabular-nums">
                  {latest.report.totalTraders}
                </span>
              }
            />
          )}
          {counts.map((c) => (
            <MetricRow
              key={c.key}
              label={c.label}
              meta="traders long / short"
              value={
                <span className="flex items-baseline justify-end gap-1.5 tabular-nums">
                  <span style={{ color: UP_COLOR }}>{c.long ?? "—"}</span>
                  <span className="text-disabled">/</span>
                  <span style={{ color: DOWN_COLOR }}>{c.short ?? "—"}</span>
                </span>
              }
            />
          ))}
        </div>
      )}

      <div className="caption text-soft text-center">
        {config.basis === "gross"
          ? "gross counts each trader's long and short book separately"
          : "net nets each trader's books first, so it reads below gross"}
        {history ? ` · ${history.count} weekly reports` : ""}
      </div>
    </div>
  );
}

export const metalCotConcentrationFrame = defineFrame({
  ...metalCotConcentrationMeta,
  component: MetalCotConcentration,
});
