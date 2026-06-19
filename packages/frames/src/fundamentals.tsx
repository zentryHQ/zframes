import { defineFrame, useCompanyFacts } from "@zframes/core";
import type { FinancialMetric } from "@zframes/core";
import type { z } from "zod";
import { fundamentalsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundamentalsMeta.schema;

function formatValue(m: FinancialMetric): string {
  if (m.unit === "USD/shares") return `$${m.value.toFixed(2)}`;
  const abs = Math.abs(m.value);
  if (m.unit === "shares") {
    if (abs >= 1e9) return `${(m.value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(m.value / 1e6).toFixed(1)}M`;
    return m.value.toLocaleString("en-US");
  }
  const sign = m.value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function Fundamentals({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useCompanyFacts(config.symbol);

  if (isLoading)
    return <FrameStatus loading>loading SEC financials…</FrameStatus>;
  if (!data || data.metrics.length === 0)
    return <FrameStatus>no SEC financials for "{config.symbol}"</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="body-sm text-strong truncate font-semibold">
            {data.entityName || config.symbol}
          </div>
          <div className="caption text-soft truncate">
            SEC EDGAR · XBRL company facts
          </div>
        </div>
        <div className="caption text-soft shrink-0 text-right">
          keyless
          <br />
          on filing
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto">
        {data.metrics.map((m) => (
          <div key={m.label} className="rounded bg-white/[0.04] px-3 py-2">
            <div className="caption text-soft truncate">{m.label}</div>
            <div className="font-dmsans text-strong text-lg font-bold tabular-nums">
              {formatValue(m)}
            </div>
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
