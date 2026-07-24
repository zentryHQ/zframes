import { defineFrame, useMetalSpot } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPrice } from "./format";
import {
  METAL_UNIT,
  metalName,
  pricePerUnit,
  WEIGHT_UNIT_LABELS,
} from "./metals-shared";
import { metalPriceMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalPriceMeta.schema;

/** One metal's live spot price as a hero numeral, in the chosen weight unit. */
function MetalPrice({ config }: { config: z.output<typeof schema> }) {
  // The hook keys off `symbols.join(",")`, so an inline literal array is stable.
  const { metals, isLoading } = useMetalSpot([config.symbol]);
  const metal = metals.find((m) => m.symbol === config.symbol) ?? metals[0];

  if (isLoading) return <FrameStatus loading>loading spot price…</FrameStatus>;
  if (!metal) return <FrameStatus>no spot quote yet</FrameStatus>;

  // Copper is quoted per pound, not per troy ounce — the weight unit doesn't
  // apply to it, so the quote passes straight through labelled "/lb".
  const perPound = METAL_UNIT[metal.symbol] === "lb";
  const unitLabel = perPound ? "lb" : WEIGHT_UNIT_LABELS[config.unit];
  const price = perPound ? metal.price : pricePerUnit(metal.price, config.unit);
  const fix =
    metal.prevFix === undefined
      ? undefined
      : perPound
        ? metal.prevFix
        : pricePerUnit(metal.prevFix, config.unit);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1 text-center">
      <div className="caption text-soft uppercase">
        {metalName(metal.symbol)} spot
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="metric-lg text-strong leading-none tabular-nums">
          {formatPrice(price)}
        </span>
        <span className="body-sm text-soft">/{unitLabel}</span>
      </div>

      {metal.changePct === undefined ? (
        <div className="caption text-disabled">—</div>
      ) : (
        <div
          className="body-sm font-bold tabular-nums"
          style={{ color: changeColor(metal.changePct) }}
        >
          {formatChangePct(metal.changePct)} vs fix
        </div>
      )}

      {config.showFix && fix !== undefined && (
        <div className="caption text-soft tabular-nums">
          fix {formatPrice(fix)}/{unitLabel}
        </div>
      )}
    </div>
  );
}

export const metalPriceFrame = defineFrame({
  ...metalPriceMeta,
  component: MetalPrice,
});
