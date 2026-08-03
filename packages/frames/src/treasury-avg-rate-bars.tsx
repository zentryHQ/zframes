import { BarChart } from "@zframes/charts";
import { defineFrame, useTreasuryAverageRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { treasuryAvgRateBarsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = treasuryAvgRateBarsMeta.schema;

function TreasuryAvgRateBars({ config }: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useTreasuryAverageRates();

  const data = useMemo(
    () =>
      [...rates]
        .sort((a, b) => b.rate - a.rate)
        .slice(0, config.limit)
        .map((r) => ({ label: r.security, value: r.rate })),
    [rates, config.limit],
  );

  if (isLoading)
    return <FrameStatus loading>loading average rates…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no average-rate data yet</FrameStatus>;

  return (
    // The bar height is content-driven (24px per rate), so a long list is taller
    // than the card and used to overflow the body and clip the bottom bars.
    // Squeezing the bars to fit would make them unreadable, so the overflow
    // scrolls instead — the package's convention for a list that outgrows its
    // card. `justify-center` is deliberately NOT combined with the scroll area:
    // centred flex content that overflows becomes unreachable above the scroll
    // origin.
    <div className="flex h-full min-h-0 flex-col text-normal">
      <div className={`min-h-0 flex-1 ${scrollAreaClass}`}>
        <BarChart
          data={data}
          orientation="horizontal"
          height={Math.max(data.length * 24, 96)}
          formatValue={formatPct}
        />
      </div>
    </div>
  );
}

export const treasuryAvgRateBarsFrame = defineFrame({
  ...treasuryAvgRateBarsMeta,
  component: TreasuryAvgRateBars,
});
