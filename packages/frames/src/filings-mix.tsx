import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useCompanyFilings } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { holeFontSize } from "./fit-text";
import { formatPct } from "./format";
import { filingsMixMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
import { FrameStatus } from "./ui";

const schema = filingsMixMeta.schema;

// Mirrors filings-feed.tsx's categorisation (not exported there, so replicated here).
const IMPORTANT_RE =
  /^(10-K|10-Q|8-K|20-F|40-F|6-K|S-|F-|424|DEF |DEFA|DEFM|11-K|SC 13|25)/i;
const INSIDER_RE = /^(3|4|5|144)(\/A)?$/;

function shortForm(form: string): string {
  return form.replace(/^SCHEDULE /i, "SC ").trim();
}

function bucketOf(form: string): "important" | "insider" | "other" {
  const short = shortForm(form);
  if (INSIDER_RE.test(short)) return "insider";
  if (IMPORTANT_RE.test(short)) return "important";
  return "other";
}

const BUCKETS = [
  {
    id: "important",
    label: "Periodic & material",
    color: CHART_COLORS_MULTI_SERIES[0],
  },
  {
    id: "insider",
    label: "Insider (3/4/5/144)",
    color: CHART_COLORS_MULTI_SERIES[2],
  },
  { id: "other", label: "Other", color: CHART_COLORS_MULTI_SERIES[5] },
] as const;

function FilingsMix({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useCompanyFilings(config.symbol);

  const { slices, pie, colors } = useMemo(() => {
    const counts: Record<"important" | "insider" | "other", number> = {
      important: 0,
      insider: 0,
      other: 0,
    };
    for (const filing of data?.filings ?? []) counts[bucketOf(filing.form)]++;
    const sorted = BUCKETS.map((bucket) => ({
      ...bucket,
      value: counts[bucket.id],
    }))
      .filter((bucket) => bucket.value > 0)
      .sort((a, b) => b.value - a.value);
    return {
      slices: sorted,
      pie: sorted.map((slice) => ({ name: slice.label, value: slice.value })),
      colors: sorted.map((slice) => slice.color),
    };
  }, [data]);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (isLoading) return <FrameStatus loading>loading SEC filings…</FrameStatus>;
  if (slices.length === 0)
    return (
      <FrameStatus>no SEC filings for “{tickerOf(config.symbol)}”</FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4">
      <div className="min-h-0 w-full flex-1">
        {/* `fill` scales the ring to the card; width/height stay behind it as
            the reference box the radii keep their proportions against. */}
        <PieChart
          data={pie}
          fill
          width={200}
          height={200}
          innerRadius={58}
          outerRadius={92}
          colors={colors}
        >
          {/* The count alone. A donut hole is widest across its middle, so every
              extra line pushes text out to where the chord has narrowed: the
              company name went to the card title (`titleContent` below, which
              has a whole row for it) and the word "filings" went with it, since
              the title now says so. What is left scales to the hole PieChart
              measured (`--zf-pie-hole`; the radii scale with `fill`, so only
              the chart knows it) — a 4-digit filer prints "1001", and 36px of
              that is wider than a small card's hole. */}
          <span
            className="metric-lg text-strong leading-none"
            style={{
              fontSize: holeFontSize(String(total), "--zf-pie-hole", "2.25rem"),
              maxWidth: "calc(var(--zf-pie-hole, 100%) * 0.86)",
            }}
          >
            {total}
          </span>
        </PieChart>
      </div>

      <SliceLegend>
        {slices.map((slice) => (
          <SliceLegend.Item
            key={slice.id}
            color={slice.color}
            label={slice.label}
          >
            {formatPct((slice.value / total) * 100, 0)}
          </SliceLegend.Item>
        ))}
      </SliceLegend>
    </div>
  );
}

export const filingsMixFrame = defineFrame({
  ...filingsMixMeta,
  component: FilingsMix,
  // Which company, in the header rather than the donut hole. The ticker is the
  // config, so this needs no data: a card whose SEC fetch is still in flight
  // still says whose filings it is.
  titleContent: ({ config }) => <>{tickerOf(config.symbol)} · Filings Mix</>,
});
