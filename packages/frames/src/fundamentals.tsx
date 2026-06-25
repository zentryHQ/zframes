import { defineFrame, useCompanyFacts } from "@zframes/core";
import type { FinancialMetric } from "@zframes/core";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompact, formatCompactUsd, formatPrice } from "./format";
import { fundamentalsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = fundamentalsMeta.schema;

function formatValue(m: FinancialMetric): string {
  if (m.unit === "USD/shares") return formatPrice(m.value);
  if (m.unit === "shares") return formatCompact(m.value);
  return formatCompactUsd(m.value);
}

function Fundamentals({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useCompanyFacts(config.symbol);

  if (isLoading)
    return <FrameStatus loading>loading SEC financials…</FrameStatus>;
  if (!data || data.metrics.length === 0)
    return (
      <FrameStatus>
        no SEC financials for “{tickerOf(config.symbol)}”
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="body-sm text-strong truncate font-semibold">
            {data.entityName || tickerOf(config.symbol)}
          </div>
          <div className="caption text-soft truncate">
            SEC EDGAR · XBRL company facts
          </div>
        </div>
        <div className="caption text-soft shrink-0 text-right">on filing</div>
      </div>

      <div
        className={`grid grid-cols-2 content-start gap-2 ${scrollAreaClass}`}
      >
        {data.metrics.map((m) => (
          <div key={m.label} className="rounded bg-white/[0.04] px-3 py-2">
            <div className="caption text-soft truncate">{m.label}</div>
            <div className="metric-sm text-strong">{formatValue(m)}</div>
            <div className="caption text-soft truncate">{m.fiscalPeriod}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const fundamentalsFrame = defineFrame({
  ...fundamentalsMeta,
  component: Fundamentals,
});
