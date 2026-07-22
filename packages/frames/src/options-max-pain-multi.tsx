import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import type { OptionsStrikeOi } from "@zframes/spec";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { optionsMaxPainMultiMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsMaxPainMultiMeta.schema;

/** The strike minimizing aggregate option-writer payout at that settlement
 *  price — see Max Pain by Strike for the full explanation of the calc. */
function maxPainStrikeOf(strikes: OptionsStrikeOi[]): number | null {
  if (strikes.length === 0) return null;
  let best = strikes[0].strike;
  let minPain = Infinity;
  for (const k of strikes) {
    let pain = 0;
    for (const s of strikes) {
      if (k.strike > s.strike) pain += s.callOi * (k.strike - s.strike);
      else if (k.strike < s.strike) pain += s.putOi * (s.strike - k.strike);
    }
    if (pain < minPain) {
      minPain = pain;
      best = k.strike;
    }
  }
  return best;
}

function OptionsMaxPainMulti({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  // Plotted as % deviation from spot, not the raw strike — a bar chart's zero
  // baseline would otherwise anchor every bar near the same (large) price
  // level and hide the real signal: which expiries are pinned above vs below
  // where the market trades today.
  const data: BarDatum[] = useMemo(() => {
    const expiries = summary?.allExpiries;
    const spot = summary?.underlyingPrice;
    if (!expiries || expiries.length === 0 || !spot) return [];
    return [...expiries]
      .sort((a, b) => a.expiryMs - b.expiryMs)
      .slice(0, config.expiries)
      .map((e) => {
        const strike = maxPainStrikeOf(e.strikes);
        return strike === null
          ? null
          : { label: e.expiry, value: (strike / spot - 1) * 100 };
      })
      .filter((d): d is BarDatum => d !== null);
  }, [summary, config.expiries]);

  if (isLoading) return <FrameStatus loading>loading options…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no options data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={200}
        formatValue={formatChangePct}
      />
      <div className="caption text-soft text-center">
        max pain vs spot, by expiry · {config.currency}
      </div>
    </div>
  );
}

export const optionsMaxPainMultiFrame = defineFrame({
  ...optionsMaxPainMultiMeta,
  component: OptionsMaxPainMulti,
});
