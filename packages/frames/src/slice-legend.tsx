import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/**
 * The swatch/label/value legend that sits under a share chart.
 *
 * Seven frames drew this by hand. Five of them — `volume-share-donut`,
 * `yield-risk-pie`, `mining-pools-share`, `portfolio-allocation`,
 * `filings-mix` — were byte-identical rows inside a byte-identical wrapper. The
 * other two are the stacked-area variant, and `ofr-stress-category-area:30`
 * says the quiet part out loud in a comment: *"StackedAreaChart has no built-in
 * legend (unlike MultiSeriesLineChart), so each frame that uses it draws its own
 * from the same series/color pairs."* `treasury-debt-composition-area` holds the
 * identical copy of that one.
 *
 *     <SliceLegend>
 *       {slices.map((s) => (
 *         <SliceLegend.Item key={s.name} color={s.color} label={s.name}>
 *           {formatPct((s.value / total) * 100, 1)}
 *         </SliceLegend.Item>
 *       ))}
 *     </SliceLegend>
 *
 * `size` is the one thing the parts must agree on — a `sm` legend pairs a
 * smaller dot with the smaller caption type — so it lives in a context rather
 * than being repeated on every item. Items take an optional value as children:
 * a pie legend prints the share, an area legend names the band and stops.
 */

type LegendSize = "sm" | "md";

const SliceLegendSizeContext = createContext<LegendSize>("md");

const WRAPPERS: Record<LegendSize, string> = {
  /** The stacked-area band list: tighter, quieter, no value column. */
  sm: "flex flex-wrap items-center justify-center gap-x-3 gap-y-1",
  /** The pie/donut share list. `max-w-xs` keeps it under the chart it labels. */
  md: "flex w-full max-w-xs flex-wrap justify-center gap-x-5 gap-y-1.5",
};

const SWATCHES: Record<LegendSize, string> = {
  sm: "h-1.5 w-1.5 shrink-0 rounded-full",
  md: "h-2 w-2 flex-shrink-0 rounded-full",
};

/** Row type + swatch-to-label gap, kept per size as each variant had it. */
const ROWS: Record<LegendSize, string> = {
  sm: "caption text-soft flex items-center gap-1",
  md: "body-sm text-soft flex items-center gap-1.5",
};

export function SliceLegend({
  size = "md",
  children,
}: {
  size?: LegendSize;
  children: ReactNode;
}) {
  return (
    <SliceLegendSizeContext.Provider value={size}>
      <div className={WRAPPERS[size]}>{children}</div>
    </SliceLegendSizeContext.Provider>
  );
}

/**
 * One entry: the series' colour, its name, and optionally its share.
 *
 * `color` is the exact colour the chart drew that slice in, passed by the frame
 * from the same series/colour pair — which is the whole point of the legend and
 * the one thing that must never be recomputed here.
 */
function SliceLegendItem({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  /** The formatted share. Omit it for a name-only band legend. */
  children?: ReactNode;
}) {
  const size = useContext(SliceLegendSizeContext);
  return (
    <div className={ROWS[size]}>
      <span className={SWATCHES[size]} style={{ background: color }} />
      <span>{label}</span>
      {children !== undefined && children !== null && (
        <span className="body-sm text-normal font-bold tabular-nums">
          {children}
        </span>
      )}
    </div>
  );
}

SliceLegend.Item = SliceLegendItem;
