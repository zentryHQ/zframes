import type { ReactNode } from "react";

/**
 * The shell a chart frame's interior is built from: a column that owns the
 * card's full height, a plot body that may shrink, and an optional caption
 * under it explaining the axes.
 *
 * Forty-seven frames wrote this by hand in **twenty-six different class
 * strings** for the same three-part structure. Most of the divergence is
 * accident — the ScatterChart family is the tell, where twelve of thirteen
 * frames share one identical string and `home-value-scatter` alone drifted.
 *
 * THE CHART IS ALWAYS A CHILD, NEVER A PROP. This is not a style preference:
 * `tests/chart-events-coverage.test.ts:97` derives which frames accept event
 * markers by regex-matching `/<TimeSeriesChart\b/` **in each frame's own source
 * file**. A `<ChartCard chart="scatter">` API that rendered the chart for the
 * frame would delete that literal from 47 files and fail both halves of that
 * test at once — the `missing` assertion (metas claiming `annotatable` whose
 * frame no longer names the chart) and the `stale` one. The same reasoning
 * applies to `tests/heatmap-label-fit.test.ts` and
 * `tests/currency-coverage.test.ts`: this repo's guards read frame source text,
 * so an abstraction here must stay grep-visible from the frame that uses it.
 *
 *     <ChartCard align="center" gap={1} className="text-normal">
 *       <ChartCard.Body>
 *         <ScatterChart data={data} yScale="log" fill formatY={money.compact} />
 *       </ChartCard.Body>
 *       <ChartCard.Caption>24h floor change (x) vs 24h volume (y, log)</ChartCard.Caption>
 *     </ChartCard>
 *
 * `min-h-0` on both the column and the body is the load-bearing part, and the
 * reason hand-rolled shells kept breaking: without it a flex child refuses to
 * shrink below its content, so a chart in a short card overflows the card
 * instead of compressing inside it.
 */

const GAPS = {
  1: "gap-1",
  1.5: "gap-1.5",
  2: "gap-2",
  3: "gap-3",
} as const;

/** Written out literally — a template-built `gap-${n}` never reaches the CSS. */
export type ChartCardGap = keyof typeof GAPS;

export function ChartCard({
  align = "stretch",
  gap = 2,
  className,
  children,
}: {
  /**
   * `center` adds `justify-center`, for interiors that do not fill their height
   * — a three-row bar list or a single figure floats in the middle of the card
   * rather than clinging to its top. A full-bleed chart wants `stretch`.
   */
  align?: "stretch" | "center";
  gap?: ChartCardGap;
  /**
   * Escape hatch for the genuine per-frame extras, most commonly `text-normal`
   * (28 of the 47 shells set a default ink for their labels). Deliberately a
   * className rather than an `ink` prop: inventing a vocabulary for one
   * Tailwind class buys nothing.
   */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col${
        align === "center" ? " justify-center" : ""
      } ${GAPS[gap]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * The plot. Takes the height left over after the captions and, crucially, is
 * allowed to shrink — `fill` on the chart inside reads its height from here.
 */
function ChartCardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-h-0 flex-1${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

/**
 * The line under the plot naming what the axes mean. Quiet on purpose: it is
 * documentation, and the data has to win.
 *
 * `className` exists for the footnotes that deliberately wrap to two lines and
 * need `leading-snug` to stay inside a short card. Without it those frames kept
 * a hand-written caption div, which is the duplication this file removes.
 */
function ChartCardCaption({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`caption text-soft text-center${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

ChartCard.Body = ChartCardBody;
ChartCard.Caption = ChartCardCaption;

/**
 * The gauge counterpart: a centred column holding one `RadialGauge` and its
 * caption. Six frames (`vix-gauge`, `put-call-gauge`, `dominance-gauge`,
 * `sentiment-gauge`, `metal-cot-gauge`, `nyfed-fed-funds-band-gauge`) share
 * this shell, five of them character-for-character.
 *
 * Separate from `ChartCard` because the shape genuinely differs rather than
 * varying by a flag: a gauge sizes itself and needs no shrinkable `flex-1`
 * body, and its readout lives INSIDE the arc via `RadialGauge`'s own centre
 * slot — so the value and label are children of the gauge, not of the card.
 *
 *     <GaugeCard>
 *       <RadialGauge value={v} max={max} color={regime.color} fill>
 *         <GaugeCard.Value tint={regime.color}>{formatLevel(v)}</GaugeCard.Value>
 *         <GaugeCard.Label>{regime.label}</GaugeCard.Label>
 *       </RadialGauge>
 *       <GaugeCard.Caption>30-day implied S&P volatility · {date}</GaugeCard.Caption>
 *     </GaugeCard>
 */
export function GaugeCard({
  gap = 1,
  children,
}: {
  gap?: ChartCardGap;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center ${GAPS[gap]}`}
    >
      {children}
    </div>
  );
}

/**
 * The figure inside the arc.
 *
 * The soft bloom behind it is keyed off the caller's own regime colour, so it
 * reads as a property of the data rather than decoration. **Four of the six
 * gauge frames draw it and two do not** (`put-call-gauge`, `metal-cot-gauge`),
 * which is why it is a prop instead of being baked in: whether that difference
 * was a decision or drift is not knowable from the code, and quietly adding a
 * glow to a card that never had one is not a refactor. Default matches the
 * majority; the two pass `glow={false}`.
 *
 * `glow` also takes a colour STRING, because the default cannot always be
 * derived. Deriving it means appending an alpha pair to the tint (`#F2155355`),
 * which is only valid when the tint is a hex literal — `dominance-gauge`'s tint
 * is an `hsl(var(--zf-accent-hue) …)` expression, where string-appending `55`
 * produces garbage CSS that silently drops the shadow. Those frames pass their
 * own bloom colour, alpha included.
 */
function GaugeCardValue({
  tint,
  glow = true,
  children,
}: {
  tint?: string;
  /** `true` derives the bloom from a hex `tint`; a string IS the bloom colour. */
  glow?: boolean | string;
  children: ReactNode;
}) {
  const shadow =
    typeof glow === "string"
      ? `0 0 28px ${glow}`
      : glow && tint
        ? `0 0 28px ${tint}55`
        : undefined;
  return (
    <div
      className="metric-xl leading-none"
      style={
        tint || shadow
          ? { color: tint, ...(shadow ? { textShadow: shadow } : null) }
          : undefined
      }
    >
      {children}
    </div>
  );
}

/** The regime word under the figure ("elevated", "greed", "backwardation"). */
function GaugeCardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="caption text-soft mt-1 tracking-wide uppercase">
      {children}
    </div>
  );
}

/** The gauge's footnote. Already centred by the card, so no `text-center`. */
function GaugeCardCaption({ children }: { children: ReactNode }) {
  return <div className="caption text-soft">{children}</div>;
}

GaugeCard.Value = GaugeCardValue;
GaugeCard.Label = GaugeCardLabel;
GaugeCard.Caption = GaugeCardCaption;
