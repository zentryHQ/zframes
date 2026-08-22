import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useCompanyFactsHistory,
  type FinancialSeries,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { CardHeader } from "./card-header";
import { ChartCard } from "./chart-card";
import {
  changeColor,
  formatChangePct,
  formatCompact,
  formatCompactUsd,
} from "./format";
import { timeframeFor } from "./metals-shared";
import { financialsTrendMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { FrameStatus } from "./ui";

const schema = financialsTrendMeta.schema;
type Metric = z.output<typeof schema>["metric"];

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Compare published labels on letters and digits alone: issuers reword the
 *  same line ("Net income" vs "Net income (loss)") and the apostrophe in
 *  "Shareholders' equity" arrives straight or curly depending on the source.
 *  The accepted lists below are written pre-normalised. */
const norm = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Which series labels count as each metric. The SEC provider labels its
 *  headline series ("Revenue", "Diluted EPS"); the extra spellings are what a
 *  reworded upstream would send, and accepting them costs nothing. */
const METRIC_LABELS: Record<Metric, string[]> = {
  revenue: ["revenue", "revenues", "total revenue", "net sales"],
  netIncome: ["net income", "net income loss", "net earnings"],
  assets: ["total assets", "assets"],
  equity: [
    "shareholders equity",
    "stockholders equity",
    "total shareholders equity",
    "total equity",
  ],
  eps: [
    "diluted eps",
    "eps diluted",
    "diluted earnings per share",
    "earnings per share diluted",
  ],
};

/** Prose names, for the header and for empty states that must name what was
 *  looked for — "no data" on a card configured for equity is unactionable. */
const METRIC_NAME: Record<Metric, string> = {
  revenue: "revenue",
  netIncome: "net income",
  assets: "total assets",
  equity: "shareholders’ equity",
  eps: "diluted EPS",
};

/** A per-share figure is a price, not a magnitude: "$3.10" reads, "$3.10" via
 *  the compact helper would come out as a bare "3". */
const formatPerShare = (value: number) => value.toFixed(2);

/** Keyed by the series' own XBRL unit — never assume USD, since EPS arrives as
 *  "USD/shares" and a share count as "shares". Module-level so the identity is
 *  stable: `formatValue` sits in the chart's redraw deps, and a fresh closure
 *  per render rebuilds the whole chart. */
const VALUE_FORMAT: Record<string, (value: number) => string> = {
  usd: formatCompactUsd,
  "usd/shares": formatPerShare,
  shares: formatCompact,
};
const formatFor = (unit: string) =>
  VALUE_FORMAT[unit.toLowerCase()] ?? formatCompact;

function FinancialsTrend({ config }: { config: z.output<typeof schema> }) {
  // The schema accepts a HIP-3 symbol ("xyz:NVDA") and promises the dex prefix
  // is stripped — EDGAR only knows the bare ticker.
  const ticker = tickerOf(config.symbol);
  const { data, isLoading } = useCompanyFactsHistory(ticker, config.cadence);

  const picked = useMemo<FinancialSeries | null>(() => {
    const accepted = METRIC_LABELS[config.metric];
    return data?.series.find((s) => accepted.includes(norm(s.label))) ?? null;
  }, [data, config.metric]);

  /** Facts are already oldest→newest; drop any whose date or value wouldn't
   *  survive rendering rather than letting a NaN reach the axis. */
  const points = useMemo(() => {
    if (!picked) return [];
    return picked.facts
      .map((fact) => ({
        time: Date.parse(fact.end),
        value: fact.value,
        fiscalPeriod: fact.fiscalPeriod,
      }))
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
  }, [picked]);

  const series: MultiSeriesData[] = useMemo(() => {
    // One point draws no path — that's an empty axis, not a chart.
    if (!picked || points.length < 2) return [];
    return [
      {
        id: config.metric,
        name: picked.label,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: points.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      },
    ];
  }, [picked, points, config.metric]);

  if (isLoading && !data)
    return <FrameStatus loading>loading reported financials…</FrameStatus>;
  if (!data)
    return <FrameStatus>no SEC company facts for “{ticker}”</FrameStatus>;
  if (!picked || points.length === 0)
    return (
      <FrameStatus>
        no {METRIC_NAME[config.metric]} reported for “{ticker}”
      </FrameStatus>
    );

  const format = formatFor(picked.unit);
  const first = points[0];
  const latest = points[points.length - 1];
  const move = latest.value - first.value;
  // A percent change off a zero or negative base flips sign and lies — a loss
  // narrowing from -2B to -1B is not "-50%" — so anything but a positive first
  // print falls back to the absolute move.
  const moveText =
    points.length < 2
      ? null
      : first.value > 0
        ? formatChangePct((move / first.value) * 100)
        : `${move >= 0 ? "+" : ""}${format(move)}`;
  const spanYears = (latest.time - first.time) / YEAR_MS;

  return (
    <ChartCard>
      <CardHeader align="start">
        <CardHeader.Main>
          <CardHeader.Eyebrow>
            {METRIC_NAME[config.metric]} · {data.entityName || ticker}
          </CardHeader.Eyebrow>
          {/* The fiscal period rides INSIDE the figure as an inline caption, so
              it sits on the number's baseline rather than on a line of its own. */}
          <CardHeader.Value size="metric-sm" className="tabular-nums">
            {format(latest.value)}
            <span className="caption text-soft ml-1.5">
              {latest.fiscalPeriod}
            </span>
          </CardHeader.Value>
        </CardHeader.Main>
        {moveText && (
          <CardHeader.Aside>
            {/* `caps={false}`: "since Q3 2024" is a sentence, not an eyebrow. */}
            <CardHeader.Eyebrow caps={false}>
              since {first.fiscalPeriod}
            </CardHeader.Eyebrow>
            <CardHeader.Value size="body-sm" tint={changeColor(move)}>
              {moveText}
            </CardHeader.Value>
          </CardHeader.Aside>
        )}
      </CardHeader>

      <ChartCard.Body>
        {series.length > 0 ? (
          <TimeSeriesChart
            series={series}
            timeframe={timeframeFor(spanYears)}
            fill
            formatValue={format}
          />
        ) : (
          <FrameStatus>
            one reported period so far — no trend to chart yet
          </FrameStatus>
        )}
      </ChartCard.Body>

      <ChartCard.Caption>
        {data.cadence} filings as reported · {picked.unit}
        {/* The series genuinely is spliced where the issuer re-tagged the line
            mid-history; a reader comparing it to a single-tag chart elsewhere
            deserves to know why they differ. */}
        {picked.concepts.length > 1 &&
          ` · stitched across ${picked.concepts.length} XBRL tags`}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const financialsTrendFrame = defineFrame({
  ...financialsTrendMeta,
  component: FinancialsTrend,
});
