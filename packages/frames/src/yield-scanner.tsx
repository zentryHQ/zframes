import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { UP_COLOR, formatCompactUsd, formatPct, prettySlug } from "./format";
import { MetricRow } from "./metric-row";
import { yieldScannerMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = yieldScannerMeta.schema;

function YieldScanner({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useYieldPools();

  const rows = useMemo(
    () =>
      pools
        .filter(
          (p) =>
            (!config.stablecoinOnly || p.stablecoin) &&
            p.tvlUsd >= config.minTvlUsd,
        )
        .sort((a, b) => b.apy - a.apy)
        .slice(0, config.limit),
    [pools, config.stablecoinOnly, config.minTvlUsd, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading yields…</FrameStatus>;
  if (rows.length === 0) return <FrameStatus>no pools match</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {rows.map((p) => (
        <MetricRow
          key={p.pool}
          label={p.symbol}
          meta={`${prettySlug(p.project)} · ${p.chain} · ${formatCompactUsd(p.tvlUsd)}${p.stablecoin ? " · stable" : ""}`}
          value={<span style={{ color: UP_COLOR }}>{formatPct(p.apy)}</span>}
        />
      ))}
    </div>
  );
}

export const yieldScannerFrame = defineFrame({
  ...yieldScannerMeta,
  component: YieldScanner,
});
