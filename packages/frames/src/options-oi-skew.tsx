import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompact } from "./format";
import { optionsOiSkewMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsOiSkewMeta.schema;

function OptionsOiSkew({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  const view = useMemo(() => {
    if (!summary) return null;
    const spot = summary.underlyingPrice;
    const all = summary.nearestExpiry.strikes;
    if (all.length === 0) return null;
    // The N strikes nearest spot, then back to ascending order for the axis
    // — same windowing as OI by Strike, just netted into one diverging bar.
    const data: BarDatum[] = [...all]
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, config.strikes)
      .sort((a, b) => a.strike - b.strike)
      .map((s) => ({
        label: formatCompact(s.strike),
        value: s.callOi - s.putOi,
      }));
    return { data, expiry: summary.nearestExpiry.expiry };
  }, [summary, config.strikes]);

  if (isLoading) return <FrameStatus loading>loading options…</FrameStatus>;
  if (!view) return <FrameStatus>no options data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={view.data}
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={200}
        formatValue={formatCompact}
      />
      <div className="caption text-soft flex justify-between">
        <span style={{ color: UP_COLOR }}>call-heavy</span>
        <span>net OI by strike · {view.expiry}</span>
        <span style={{ color: DOWN_COLOR }}>put-heavy</span>
      </div>
    </div>
  );
}

export const optionsOiSkewFrame = defineFrame({
  ...optionsOiSkewMeta,
  component: OptionsOiSkew,
});
