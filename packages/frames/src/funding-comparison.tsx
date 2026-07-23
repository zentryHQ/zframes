import { defineFrame, useFundingComparison } from "@zframes/core";
import type { z } from "zod";
import { formatPct } from "./format";
import { MetricRow } from "./metric-row";
import { fundingComparisonMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = fundingComparisonMeta.schema;

function FundingComparison({ config }: { config: z.output<typeof schema> }) {
  const { comparison, isLoading } = useFundingComparison();
  const rows = comparison.slice(0, config.limit);

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (rows.length === 0) return <FrameStatus>no funding data yet</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {rows.map((r) => (
        <MetricRow
          key={r.coin}
          label={r.coin}
          meta={r.venues
            .map(
              (v) => `${v.venue.slice(0, 3)} ${formatPct(v.annualizedPct, 1)}`,
            )
            .join(" · ")}
          value={`${formatPct(r.spreadPct, 1)} sprd`}
        />
      ))}
    </div>
  );
}

export const fundingComparisonFrame = defineFrame({
  ...fundingComparisonMeta,
  component: FundingComparison,
});
