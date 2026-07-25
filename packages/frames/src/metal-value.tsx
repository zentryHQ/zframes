import { defineFrame, useMetalSpot, useMoney } from "@zframes/core";
import type { z } from "zod";
import {
  METAL_UNIT,
  metalName,
  toTroyOunces,
  WEIGHT_UNIT_LABELS,
} from "./metals-shared";
import { metalValueMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalValueMeta.schema;

/** Above this a holding reads better abbreviated than digit-by-digit. */
const COMPACT_ABOVE = 1_000_000;

/**
 * Troy ounces in one avoirdupois pound (453.59237 g ÷ 31.1034768 g) — the
 * bridge for copper, the one metal quoted per pound. The configured weight is
 * still a real weight in `unit`, so it converts through troy ounces into
 * pounds; reading the number as a pound count would value 500 g of copper as
 * 500 lb, ~450× too much.
 */
const TROY_OUNCES_PER_POUND = 453.59237 / 31.1034768;

function formatWeight(weight: number): string {
  return weight.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** What a physical holding is worth at live spot. */
function MetalValue({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  // The hook keys off `symbols.join(",")`, so an inline literal array is stable.
  const { metals, isLoading } = useMetalSpot([config.symbol]);
  const metal = metals.find((m) => m.symbol === config.symbol) ?? metals[0];

  if (isLoading) return <FrameStatus loading>loading spot price…</FrameStatus>;
  if (!metal) return <FrameStatus>no spot quote yet</FrameStatus>;

  // Copper is quoted per pound, so the holding is converted into pounds to meet
  // its quote; every other metal values per troy ounce. Either way the caption
  // reports the weight in the unit the user actually configured.
  const quoteUnit = METAL_UNIT[metal.symbol] ?? "oz";
  const troyOunces = toTroyOunces(config.weight, config.unit);
  const quantity =
    quoteUnit === "lb" ? troyOunces / TROY_OUNCES_PER_POUND : troyOunces;
  const heldUnit = WEIGHT_UNIT_LABELS[config.unit];
  const value = quantity * metal.price;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1 text-center">
      <div className="caption text-soft uppercase">holding value</div>

      <div className="metric-lg text-strong leading-none tabular-nums">
        {value >= COMPACT_ABOVE ? money.compact(value) : money.price(value)}
      </div>

      <div className="body-sm text-normal">
        {formatWeight(config.weight)} {heldUnit} of {metalName(metal.symbol)}
      </div>

      <div className="caption text-soft tabular-nums">
        at {money.price(metal.price)}/{quoteUnit} spot
      </div>
    </div>
  );
}

export const metalValueFrame = defineFrame({
  ...metalValueMeta,
  component: MetalValue,
});
