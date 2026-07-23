import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatCompactUsd, formatPrice } from "./format";
import { optionsMaxPainMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsMaxPainMeta.schema;

function OptionsMaxPain({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  const view = useMemo(() => {
    if (!summary) return null;
    const strikes = summary.nearestExpiry.strikes;
    if (strikes.length === 0) return null;

    // Aggregate payout option WRITERS owe if price settles at each candidate
    // strike (every in-the-money call/put pays its OI × distance ITM). The
    // strike that MINIMIZES this aggregate is "max pain" — the price at which
    // the largest share of open contracts expires worthless.
    let maxPainStrike = strikes[0].strike;
    let minPain = Infinity;
    const pains = strikes.map((k) => {
      let pain = 0;
      for (const s of strikes) {
        if (k.strike > s.strike) pain += s.callOi * (k.strike - s.strike);
        else if (k.strike < s.strike) pain += s.putOi * (s.strike - k.strike);
      }
      if (pain < minPain) {
        minPain = pain;
        maxPainStrike = k.strike;
      }
      return pain;
    });

    const bars: BarDatum[] = strikes.map((s, i) => ({
      label: formatCompact(s.strike),
      value: pains[i],
      color: s.strike === maxPainStrike ? "var(--color-highlight)" : undefined,
    }));

    return {
      bars,
      maxPainStrike,
      spot: summary.underlyingPrice,
      expiry: summary.nearestExpiry.expiry,
    };
  }, [summary]);

  if (isLoading) return <FrameStatus loading>loading options…</FrameStatus>;
  if (!view) return <FrameStatus>no options data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 text-normal">
      <div className="caption text-soft flex justify-between">
        <span>max pain · {view.expiry}</span>
        <span>
          <span className="text-strong font-bold">
            {formatPrice(view.maxPainStrike)}
          </span>{" "}
          <span className="text-soft">vs spot {formatPrice(view.spot)}</span>
        </span>
      </div>
      <BarChart
        data={view.bars}
        color="var(--color-disabled)"
        height={200}
        formatValue={formatCompactUsd}
      />
    </div>
  );
}

export const optionsMaxPainFrame = defineFrame({
  ...optionsMaxPainMeta,
  component: OptionsMaxPain,
});
