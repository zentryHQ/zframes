import {
  BarChart,
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMetalPositioning,
  type CotDisaggregated,
  type CotTraderClass,
  type CotWeek,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { ChartCard } from "./chart-card";
import { changeColor, formatCompact, formatPct } from "./format";
import { MetricRow } from "./metric-row";
import {
  divergingBars,
  downsample,
  durationSince,
  metalName,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalCotDisaggregatedMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalCotDisaggregatedMeta.schema;

/**
 * The CFTC's *disaggregated* report, which splits the legacy "commercial"
 * bucket that `metal-cot-breakdown` inherits.
 *
 * That split is the whole point of this frame: a producer selling forward and a
 * swap dealer short are opposite stories in metals — the first is supply
 * reaching the market, the second is the other side of somebody's index long —
 * and the legacy report adds them together into one number that gets quoted as
 * "commercials are short gold".
 */

/** "23 Jul 2026" — the reported Tuesday, matching the rest of the metals family. */
function formatWeek(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Contracts are a count, so compact magnitude with an explicit sign — a change
 *  or a net only reads as "added/cut" or "long by/short by". */
function signedContracts(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
}

function formatContracts(value: number): string {
  return formatCompact(Math.abs(value));
}

const netOf = (t: CotTraderClass) => t.long - t.short;

/**
 * The five disaggregated classes, labelled the way the legacy frame labels its
 * three: the plain-language role first, the report's own term as the meta. The
 * short leg is negated on the chart so the bars oppose across a zero line.
 */
const CLASSES: {
  key: string;
  label: string;
  role: string;
  /** Short form for the bar categories and the history legend. */
  bar: string;
  pick: (d: CotDisaggregated) => CotTraderClass;
}[] = [
  {
    key: "producer",
    label: "Producers & merchants",
    role: "physical hedgers · the true short",
    bar: "Prod",
    pick: (d) => d.producerMerchant,
  },
  {
    key: "swap",
    label: "Swap dealers",
    role: "banks · the other side of index longs",
    bar: "Swap",
    pick: (d) => d.swapDealer,
  },
  {
    key: "managed",
    label: "Managed money",
    role: "funds & CTAs · what the press calls the funds",
    bar: "Funds",
    pick: (d) => d.managedMoney,
  },
  {
    key: "other",
    label: "Other reportables",
    role: "large traders · none of the above",
    bar: "Other",
    pick: (d) => d.otherReportable,
  },
  {
    key: "small",
    label: "Small traders",
    role: "non-reportable · below the threshold",
    bar: "Small",
    pick: (d) => d.nonReportable,
  },
];

/**
 * Only the weeks the CFTC actually published a disaggregated report for.
 *
 * The disaggregated series starts 2006-06-13 while the legacy one runs decades
 * further back, so any long window is MIXED. Reading through an absent
 * `disaggregated` would put a zero where the agency published nothing, and a
 * hole drawn as zero is indistinguishable from a class that genuinely flattened
 * out — the one failure mode nobody would catch by looking at the card.
 */
function disaggregatedWeeks(
  weeks: readonly CotWeek[] | undefined,
): { time: number; report: CotDisaggregated }[] {
  const out: { time: number; report: CotDisaggregated }[] = [];
  for (const week of weeks ?? [])
    if (week.disaggregated)
      out.push({ time: week.time, report: week.disaggregated });
  return out;
}

/** "(CONTRACTS OF 100 TROY OUNCES)" → "contracts of 100 troy ounces". */
function contractUnits(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/[()]/g, "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

/**
 * The published extras under a class name: its share of open interest per side
 * and, for the classes that have one, its spreading book. `pctOfOi*` is a share
 * of TOTAL open interest as the CFTC computes it — not a share of the shorts,
 * which is the derived figure in the header — so it's labelled "of OI".
 */
function roleMeta(role: string, t: CotTraderClass): string {
  const bits = [role];
  if (t.pctOfOiLong !== undefined || t.pctOfOiShort !== undefined) {
    const long =
      t.pctOfOiLong === undefined ? "—" : formatPct(t.pctOfOiLong, 1);
    const short =
      t.pctOfOiShort === undefined ? "—" : formatPct(t.pctOfOiShort, 1);
    bits.push(`${long} / ${short} of OI`);
  }
  // Producers and small traders have no spreading column at all, so an absent
  // spread is normal rather than missing data — say nothing instead of "0".
  if (t.spread !== undefined && t.spread !== 0)
    bits.push(`spread ${formatCompact(t.spread)}`);
  return bits.join(" · ");
}

/**
 * One side of a class's book: contracts, then the CFTC's OWN week-over-week
 * column. Differencing two weeks here would look identical and quietly
 * disagree with the agency (their change is computed against the prior report
 * as filed, including any reclassification), so an absent `change*` shows a
 * dash rather than a number this frame made up.
 */
function Leg({
  side,
  value,
  change,
}: {
  side: string;
  value: number;
  change: number | undefined;
}) {
  return (
    <span className="flex items-baseline justify-end gap-1.5 tabular-nums">
      <span className="caption text-soft">{side}</span>
      <span>{formatCompact(value)}</span>
      {change === undefined ? (
        <span className="body-sm text-disabled">—</span>
      ) : (
        <span
          className="body-sm font-bold"
          style={{ color: changeColor(change) }}
        >
          {signedContracts(change)}
        </span>
      )}
    </span>
  );
}

function MetalCotDisaggregated({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { positioning, isLoading } = useMetalPositioning(config.symbol);

  const reports = useMemo(
    () => disaggregatedWeeks(positioning?.weeks),
    [positioning],
  );
  const latest = reports.length > 0 ? reports[reports.length - 1] : null;

  const bars = useMemo(() => {
    if (!latest) return [];
    return divergingBars(
      CLASSES.flatMap((c) => {
        const t = c.pick(latest.report);
        return [
          { label: `${c.bar} long`, value: t.long },
          { label: `${c.bar} short`, value: -t.short },
        ];
      }),
    );
  }, [latest]);

  /**
   * Who holds the shorts, as a share of all reported shorts — the figure the
   * legacy report cannot produce, because its single commercial bucket is the
   * sum of the two classes this frame separates. Derived (the CFTC publishes
   * shares of open interest, not of one side), so the caption names the base.
   */
  const shortLead = useMemo(() => {
    if (!latest) return null;
    const shorts = CLASSES.map((c) => ({
      label: c.label,
      short: c.pick(latest.report).short,
    }));
    const total = shorts.reduce((sum, s) => sum + s.short, 0);
    if (total <= 0) return null;
    const top = shorts.reduce((a, b) => (b.short > a.short ? b : a));
    return { label: top.label.toLowerCase(), pct: (top.short / total) * 100 };
  }, [latest]);

  const history = useMemo(() => {
    if (config.view !== "history") return null;
    const window = reports.slice(-config.weeks);
    // One report draws no line, and a single point on a five-series chart reads
    // as a broken chart rather than as "the history hasn't started yet".
    if (window.length < 2) return null;

    const series: MultiSeriesData[] = CLASSES.map((c, i) => ({
      id: c.key,
      name: c.bar,
      color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
      data: toChartData(
        downsample(
          window.map((r) => ({ time: r.time, value: netOf(c.pick(r.report)) })),
        ),
      ),
    }));
    // Zero has to stay on the axis: a net-position chart is read against it, and
    // producers sit far below it for years on end, so an auto domain would crop
    // the only reference line that matters.
    const plotted = series.flatMap((s) => s.data.map((d) => d.value));
    const low = Math.min(0, ...plotted);
    const high = Math.max(0, ...plotted);
    const pad = (high - low) * 0.06 || 1;
    return {
      series,
      yDomain: [low - pad, high + pad] as [number, number],
      // Weeks, not calendar years, is what the config asks for; the axis
      // granularity still wants a year figure.
      years: window.length / 52,
      count: window.length,
    };
  }, [reports, config.view, config.weeks]);

  if (isLoading && !latest)
    return <FrameStatus loading>loading disaggregated COT report…</FrameStatus>;
  if (!latest)
    return (
      <FrameStatus>
        no disaggregated COT week for {metalName(config.symbol)} — either the
        report doesn&apos;t reach this far back (it starts June 2006) or that
        fetch didn&apos;t land on this poll. The legacy COT Trader Breakdown
        frame reads meanwhile.
      </FrameStatus>
    );
  if (config.view === "history" && !history)
    return (
      <FrameStatus>
        only {reports.length} disaggregated week
        {reports.length === 1 ? "" : "s"} available — a history needs at least
        two. Switch this card to the latest week.
      </FrameStatus>
    );
  // Every leg zero is a placeholder week, not a market with no positions: ten
  // bars of length zero render as an empty axis with nothing to explain it.
  if (!history && !bars.some((b) => b.value !== 0))
    return <FrameStatus>no reported COT positions this week</FrameStatus>;

  const units = contractUnits(latest.report.contractUnits);

  return (
    <ChartCard>
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>
            {metalName(config.symbol)} disaggregated COT
          </CardHeader.Eyebrow>
          {shortLead ? (
            // A SENTENCE, not a `CardHeader.Value`: the figure is set inside a
            // `body-sm` line that has to truncate as a whole, so the shared
            // value block — one sized element — can't express it.
            <div className="body-sm text-normal truncate">
              <span className="metric-md text-strong tabular-nums">
                {formatPct(shortLead.pct, 0)}
              </span>{" "}
              of reported shorts — {shortLead.label}
            </div>
          ) : (
            <div className="body-sm text-soft">no reported shorts</div>
          )}
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Sub>{formatWeek(latest.time)}</CardHeader.Sub>
          <CardHeader.Sub>{durationSince(latest.time)} old</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      {history ? (
        <ChartCard.Body>
          <TimeSeriesChart
            series={history.series}
            timeframe={timeframeFor(history.years)}
            fill
            yDomain={history.yDomain}
            formatValue={formatCompact}
          />
        </ChartCard.Body>
      ) : (
        <>
          {/* The bars keep a pixel height on purpose: it's ten horizontal rows
              at ~22px each, so the number is the CONTENT's size rather than a
              pinned plot, and the scrolling class rows below already claim the
              rest. Filling would squash ten labelled bars into half a card. */}
          <BarChart
            data={bars}
            orientation="horizontal"
            height={Math.max(bars.length * 22, 120)}
            formatValue={formatContracts}
          />

          <div className={scrollAreaClass}>
            {CLASSES.map((c) => {
              const t = c.pick(latest.report);
              return (
                <MetricRow
                  key={c.key}
                  label={c.label}
                  meta={roleMeta(c.role, t)}
                  value={
                    <span className="flex flex-col items-end gap-0.5">
                      <Leg side="L" value={t.long} change={t.changeLong} />
                      <Leg side="S" value={t.short} change={t.changeShort} />
                    </span>
                  }
                />
              );
            })}
          </div>
        </>
      )}

      <ChartCard.Caption>
        {history ? (
          <>
            long − short per class, {history.count} weekly reports — producers
            hedge short by construction, so their line living below zero is
            structure, not a view
          </>
        ) : (
          <>
            {units ?? "contracts"} · changes are the CFTC's own week-over-week
            columns, green where the class added
          </>
        )}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalCotDisaggregatedFrame = defineFrame({
  ...metalCotDisaggregatedMeta,
  component: MetalCotDisaggregated,
});
