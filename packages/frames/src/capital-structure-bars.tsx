import { BarChart } from "@zframes/charts";
import { defineFrame, useCompanyFacts } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompactUsd } from "./format";
import { capitalStructureBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = capitalStructureBarsMeta.schema;

function CapitalStructureBars({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useCompanyFacts(config.symbol);

  const result = useMemo(() => {
    const metrics = data?.metrics ?? [];
    const assets = metrics.find((m) => m.label === "Total assets");
    const equity = metrics.find((m) => m.label === "Shareholders' equity");
    if (!assets || !equity) return null;
    return {
      fiscalPeriod: assets.fiscalPeriod,
      bars: [
        { label: "Total assets", value: assets.value },
        { label: "Liabilities", value: assets.value - equity.value },
        { label: "Shareholders' equity", value: equity.value },
      ],
    };
  }, [data]);

  if (isLoading)
    return <FrameStatus loading>loading capital structure…</FrameStatus>;
  if (!result)
    return (
      <FrameStatus>
        no SEC balance-sheet data for “{tickerOf(config.symbol)}”
      </FrameStatus>
    );

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={result.bars}
        orientation="horizontal"
        height={Math.max(result.bars.length * 24, 96)}
        formatValue={formatCompactUsd}
      />
      <div className="caption text-soft text-center">
        {data?.entityName || tickerOf(config.symbol)} · {result.fiscalPeriod} ·
        liabilities derived (assets − equity)
      </div>
    </div>
  );
}

export const capitalStructureBarsFrame = defineFrame({
  ...capitalStructureBarsMeta,
  component: CapitalStructureBars,
});
