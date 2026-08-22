import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useEquityFinancials } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import { timeframeFor } from "./metals-shared";
import { marginTrendMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { FrameStatus } from "./ui";

const schema = marginTrendMeta.schema;
type Margin = z.output<typeof schema>["margins"][number];

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Compare published labels on letters and digits alone — a filer's wording
 *  drifts ("Pre-Tax Margin" vs "Pretax Margin") and the hyphen shouldn't
 *  decide whether a line appears. Accepted lists are written pre-normalised. */
const norm = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The published row label per margin. Note the net margin ships as **"Profit
 *  Margin"** — matching only on "net margin" finds nothing, and a missing line
 *  looks exactly like a company that didn't report one. */
const MARGIN_LABELS: Record<Margin, string[]> = {
  gross: ["gross margin"],
  operating: ["operating margin"],
  preTax: ["pre tax margin", "pretax margin"],
  net: ["profit margin", "net margin", "net profit margin"],
};

const MARGIN_NAME: Record<Margin, string> = {
  gross: "Gross",
  operating: "Operating",
  preTax: "Pre-tax",
  net: "Net",
};

/** Published values are already percentages (70.1 means 70.1%) — multiplying
 *  by 100 here would print 7,010%. Module-level so the identity is stable:
 *  `formatValue` is in the chart's redraw deps. */
const formatMargin = (value: number) => formatPct(value);

/** Period labels are exchange-formatted ("1/25/2026"), not ISO. Fall back to
 *  the bare year so a reworded label still lands in the right place on the
 *  axis instead of dropping the period entirely. */
function periodTime(period: string): number | null {
  const parsed = Date.parse(period);
  if (Number.isFinite(parsed)) return parsed;
  const year = /(?:19|20)\d{2}/.exec(period);
  return year ? Date.parse(`${year[0]}-12-31`) : null;
}

function MarginTrend({ config }: { config: z.output<typeof schema> }) {
  const ticker = tickerOf(config.symbol);
  // Margins are a multi-year story; the quarterly tables would make three
  // seasonal sawtooths out of what should read as a trend.
  const { data, isLoading } = useEquityFinancials(ticker, "annual");

  const built = useMemo(() => {
    const rows = data?.ratios ?? [];
    const periods = data?.periods ?? [];
    const found: { key: Margin; points: { time: number; value: number }[] }[] =
      [];
    const missing: string[] = [];

    for (const key of config.margins) {
      const accepted = MARGIN_LABELS[key];
      const row = rows.find((r) => accepted.includes(norm(r.label)));
      const points = !row
        ? []
        : periods
            .map((period, i) => ({
              time: periodTime(period),
              value: row.values[i],
            }))
            // A blank cell is `null` and stays a gap — coercing it to 0 draws a
            // zero-margin year the company never reported.
            .filter(
              (p): p is { time: number; value: number } =>
                p.time !== null &&
                typeof p.value === "number" &&
                Number.isFinite(p.value),
            )
            // `periods` is NEWEST first and `values` is aligned index-for-index
            // with it, but a time axis reads oldest→newest. Without this the
            // whole card draws mirrored — and a mirrored margin trend looks
            // entirely plausible, so nothing downstream would catch it.
            .reverse();
      if (points.length === 0) {
        missing.push(MARGIN_NAME[key]);
        continue;
      }
      found.push({ key, points });
    }

    const series: MultiSeriesData[] = found
      // A single point draws no path; the headline below still reports it.
      .filter((f) => f.points.length >= 2)
      .map((f, i) => ({
        id: f.key,
        name: MARGIN_NAME[f.key],
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: f.points.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      }));
    const times = found.flatMap((f) => f.points.map((p) => p.time));
    return {
      series,
      missing,
      latest: found.map((f) => ({
        key: f.key,
        value: f.points[f.points.length - 1].value,
      })),
      spanYears: times.length
        ? (Math.max(...times) - Math.min(...times)) / YEAR_MS
        : 1,
    };
  }, [data, config.margins]);

  if (isLoading && !data)
    return <FrameStatus loading>loading published margins…</FrameStatus>;
  if (!data)
    return <FrameStatus>no published financials for “{ticker}”</FrameStatus>;
  if (built.latest.length === 0)
    return (
      <FrameStatus>
        no published margin rows for “{ticker}” ({built.missing.join(", ")})
      </FrameStatus>
    );

  return (
    <ChartCard>
      {/* Not `CardHeader`: one column PER selected margin, so there is no
          main/aside pair to route through the primitive. */}
      <div className="flex items-start justify-between gap-3">
        {built.latest.map((line) => (
          <div key={line.key} className="min-w-0">
            <div className="caption text-soft truncate uppercase">
              {MARGIN_NAME[line.key]}
            </div>
            <div className="metric-sm text-strong tabular-nums">
              {formatMargin(line.value)}
            </div>
          </div>
        ))}
      </div>

      <ChartCard.Body>
        {built.series.length > 0 ? (
          <TimeSeriesChart
            series={built.series}
            timeframe={timeframeFor(built.spanYears)}
            fill
            formatValue={formatMargin}
          />
        ) : (
          <FrameStatus>
            one reported period so far — no trend to chart yet
          </FrameStatus>
        )}
      </ChartCard.Body>

      <ChartCard.Caption>
        {ticker} · published margins, latest {data.periods[0]}
        {built.missing.length > 0 && ` · no ${built.missing.join(" or ")} row`}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const marginTrendFrame = defineFrame({
  ...marginTrendMeta,
  component: MarginTrend,
});
