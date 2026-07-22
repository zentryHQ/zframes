import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useCompanyFilings } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatPct } from "./format";
import { filingsMixMeta } from "./schemas";
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

  const slices = useMemo(() => {
    const counts: Record<"important" | "insider" | "other", number> = {
      important: 0,
      insider: 0,
      other: 0,
    };
    for (const filing of data?.filings ?? []) counts[bucketOf(filing.form)]++;
    return BUCKETS.map((bucket) => ({ ...bucket, value: counts[bucket.id] }))
      .filter((bucket) => bucket.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (isLoading)
    return <FrameStatus loading>loading SEC filings…</FrameStatus>;
  if (slices.length === 0)
    return (
      <FrameStatus>no SEC filings for “{tickerOf(config.symbol)}”</FrameStatus>
    );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <PieChart
        data={slices.map((slice) => ({
          name: slice.label,
          value: slice.value,
        }))}
        width={200}
        height={200}
        innerRadius={58}
        outerRadius={92}
        colors={slices.map((slice) => slice.color)}
      >
        <div className="flex flex-col items-center gap-0.5">
          <span className="caption text-soft">
            {data?.name || tickerOf(config.symbol)}
          </span>
          <span className="metric-lg text-strong">{total}</span>
          <span className="caption text-soft">filings</span>
        </div>
      </PieChart>

      <div className="flex w-full max-w-xs flex-wrap justify-center gap-x-5 gap-y-1.5">
        {slices.map((slice) => (
          <div key={slice.id} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span className="body-sm text-soft">{slice.label}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {formatPct((slice.value / total) * 100, 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const filingsMixFrame = defineFrame({
  ...filingsMixMeta,
  component: FilingsMix,
});
