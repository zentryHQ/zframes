import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/**
 * The label/value stat, as a compound.
 *
 * Thirteen frames each declared their own version of this and four of them
 * (`breadth-histogram`, `funding-distribution`, `metal-return-distribution`,
 * `return-distribution`) were byte-identical — same classes, same optional
 * `color`, same everything. The rest had drifted apart by accident rather than
 * intent: `px-2 py-1.5` in `crypto-profile` and `crypto-dilution`, `px-3 py-2`
 * in `company-profile`, `px-2 py-1` in `volume-profile`, `px-2 py-2` in
 * `lightning-stats` — four paddings and two radii for one element.
 *
 * WHY A COMPOUND AND NOT A `<Stat label value hint />` LEAF. Roughly half the
 * call sites print label-over-value and half print value-over-label
 * (`volume-profile`, `lightning-stats`), and a couple add a third line. As
 * props that is a `reverse` boolean plus a `third` slot; as children the
 * ORDER IS THE LAYOUT and nothing needs configuring:
 *
 *     <Stat surface="tile">
 *       <Stat.Label>Market cap</Stat.Label>
 *       <Stat.Value tint={changeColor(pct)}>{money.compact(cap)}</Stat.Value>
 *       <Stat.Hint>{ticker}</Stat.Hint>
 *     </Stat>
 *
 *     <Stat align="center">
 *       <Stat.Value>{money.compact(vol)}</Stat.Value>
 *       <Stat.Label>24h volume</Stat.Label>
 *     </Stat>
 *
 * (Value first in that second one — that IS the inverted layout, no prop for it.)
 *
 * `align` is the one thing that genuinely has to be shared, which is why there
 * is a context here at all: centring a stat means centring all three of its
 * lines, and making each caller repeat `text-center` on every child is exactly
 * the bug the old copies kept making. Nothing else is contextual — the parts do
 * not invent shared state just to look like a compound.
 *
 * NEVER GIVE `Stat.Value` A FORMATTER PROP. `MoverRow` learned this the hard
 * way: it took an optional `formatValue` defaulting to `formatPrice`, two of its
 * three callers passed nothing, and a hard-coded `$` moved into the primitive
 * where `tests/currency-coverage.test.ts`'s per-frame source scan could no
 * longer see it — a dollar sign on a baht board, invisible to the guard built
 * to catch exactly that. Callers format their own money through `useMoney()`
 * and hand this a string or a node.
 */

type StatAlign = "start" | "center";

const StatAlignContext = createContext<StatAlign>("start");

/** `text-center` only where the parent asked for it; otherwise nothing. */
function useAlignClass(): string {
  return useContext(StatAlignContext) === "center" ? " text-center" : "";
}

const SURFACES = {
  /** Bare — the stat sits directly on the card. */
  none: "min-w-0",
  /**
   * An inner tinted tile. This is NOT card chrome: frame chrome (the card, its
   * border, its hover) lives in the renderer's injected `.zf-*` stylesheet and
   * frames style only their interior. This is the interior tile thirteen frames
   * were already drawing by hand.
   */
  tile: "min-w-0 rounded-md bg-white/[0.04] px-2 py-1.5",
};

export type StatSurface = keyof typeof SURFACES;

/**
 * Value type scale. Named for the tokens themselves rather than `sm`/`md`/`lg`,
 * because the jump from `body-sm` to `metric-sm` is `text-sm` → `text-xl` and a
 * four-stat strip in a small card cannot absorb it silently. The frame author
 * should see which token they are choosing.
 */
const VALUE_SIZES = {
  /** `body-sm` weight+figures — the dense multi-stat strip. */
  body: "body-sm font-bold tabular-nums truncate",
  /** `metric-sm` (text-xl) — a tile's headline figure. */
  "metric-sm": "metric-sm truncate",
  /** `metric-md` (text-2xl) — a card's single hero figure. */
  "metric-md": "metric-md truncate",
} as const;

export type StatValueSize = keyof typeof VALUE_SIZES;

/**
 * Figure ink, split OUT of the size class so an `absent` placeholder replaces
 * it rather than stacking a second ink utility on the same element — with two
 * present, which one wins is decided by the order they happen to sit in the
 * stylesheet instead of by the caller. `card-header.tsx` documents the same
 * split for the same reason.
 *
 * `body` carries no ink on purpose: the dense strip inherits the card's, which
 * is what its call sites were written against.
 */
const VALUE_INKS: Record<StatValueSize, string> = {
  body: "",
  "metric-sm": " text-strong",
  "metric-md": " text-strong",
};

/**
 * Every span and gap the strip can take, written out literally.
 *
 * A template-built `grid-cols-${n}` / `gap-${n}` is invisible to Tailwind's
 * source scanner: the class never lands in the stylesheet and the strip renders
 * as one unstyled column. Nothing errors — it just looks like a design mistake.
 */
const STRIP_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const STRIP_GAPS: Record<number, string> = {
  1: "gap-1",
  // 1.5 is not a rounding artefact — five real strips use it, and omitting it
  // sent them back to a hand-written grid, which is the duplication this file
  // exists to end. Kept in step with `ChartCard`'s `GAPS`.
  1.5: "gap-1.5",
  2: "gap-2",
  3: "gap-3",
};

export function Stat({
  surface = "none",
  align = "start",
  orientation = "col",
  className,
  children,
}: {
  surface?: StatSurface;
  /** Centres every line of the stat, not just the wrapper. */
  align?: StatAlign;
  /**
   * `row` puts the label and value on one baseline, spread apart — the
   * horizontal reading `tokenized-gold` uses. `col` stacks them.
   */
  orientation?: "col" | "row";
  className?: string;
  children: ReactNode;
}) {
  const layout =
    orientation === "row"
      ? "flex items-baseline justify-between gap-2"
      : `flex flex-col${align === "center" ? " items-center" : ""}`;
  return (
    <StatAlignContext.Provider value={align}>
      <div
        className={`${SURFACES[surface]} ${layout}${
          className ? ` ${className}` : ""
        }`}
      >
        {children}
      </div>
    </StatAlignContext.Provider>
  );
}

/** The quiet uppercase caption naming the figure. */
function StatLabel({ children }: { children: ReactNode }) {
  const align = useAlignClass();
  return (
    <div className={`caption text-soft truncate uppercase${align}`}>
      {children}
    </div>
  );
}

/**
 * The figure itself. `tint` takes an already-resolved colour (in practice
 * `changeColor(pct)`), left `undefined` for the default ink — a semantic
 * up/down colour is the caller's reading of its own data, and it routes through
 * `--zf-up`/`--zf-down` so a board's chosen pair wins.
 */
function StatValue({
  size = "body",
  tint,
  absent,
  children,
}: {
  size?: StatValueSize;
  tint?: string;
  /**
   * There is no reading — an em dash, not a figure. Renders in disabled ink so
   * it cannot be mistaken for data, and beats `tint`: an absent value must not
   * arrive wearing a gain/loss colour it has no direction for. Same contract as
   * `CardHeader.Value`'s `absent`.
   */
  absent?: boolean;
  children: ReactNode;
}) {
  const align = useAlignClass();
  const ink = absent ? " text-disabled" : VALUE_INKS[size];
  return (
    <div
      className={`${VALUE_SIZES[size]}${ink}${align}`}
      style={tint && !absent ? { color: tint } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * A third line under the value: a ticker, a date, a denominator — or a signed
 * delta, which is why it takes a `tint`.
 *
 * Without one, `lightning-stats` could not use this at all: its third line
 * carries `changeColor(delta)`, and a hint that cannot be tinted would have
 * silently dropped the gain/loss reading, which is the one thing on that line
 * a user is looking at.
 */
function StatHint({ tint, children }: { tint?: string; children: ReactNode }) {
  const align = useAlignClass();
  return (
    <div
      className={`caption truncate${tint ? "" : " text-soft"}${align}`}
      style={tint ? { color: tint } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The row of stats. Nineteen frames wrote this grid by hand in ten different
 * class strings; `cols` is capped at the 2-6 Tailwind classes listed statically
 * in `STRIP_COLS` because a template-built `grid-cols-${n}` is invisible to
 * Tailwind's scanner and silently produces an unstyled single column.
 */
function StatStrip({
  cols = 4,
  gap = 2,
  className,
  children,
}: {
  cols?: 2 | 3 | 4 | 5 | 6;
  gap?: 1 | 1.5 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid ${STRIP_COLS[cols]} ${STRIP_GAPS[gap]}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

Stat.Label = StatLabel;
Stat.Value = StatValue;
Stat.Hint = StatHint;
Stat.Strip = StatStrip;
