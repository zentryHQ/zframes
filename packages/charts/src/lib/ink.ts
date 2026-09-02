/**
 * Chart chrome painted against the board's surface instead of a baked white.
 *
 * The board publishes `--zf-ink-l` (100% on a dark board, 16% on a light one)
 * and `--zf-surf-l1..3` (the card-gradient lightness stops) on the grid
 * container, and every text/surface token is redeclared off them — so chrome
 * that derives its greys the same way flips with `theme.surface`, while a
 * literal `#FFFFFF` tick label stays near-invisible on a light board.
 *
 * D3 must apply these through `.style()` (or a CSS class), never `.attr()`:
 * `var()` is a CSS-value feature and is NOT substituted inside an SVG
 * *presentation attribute*, so `.attr("stroke", chartInk())` paints nothing at
 * all. Where a mark already inherits the card's `color`, plain `currentColor`
 * is equally correct and cheaper.
 */

/** Board ink, optionally at `alpha`. */
export const chartInk = (alpha?: number): string =>
  alpha === undefined
    ? "hsl(0 0% var(--zf-ink-l, 100%))"
    : `hsl(0 0% var(--zf-ink-l, 100%) / ${alpha})`;

/**
 * The ink's opposite — for a mark that has to separate FROM the ink, e.g. the
 * contrast ring around a crosshair knob. Dark board: ink 100% → a near-black
 * ring (what the hard-coded `rgba(10, 12, 20, …)` used to be). Light board:
 * ink 16% → a near-white ring around a dark knob.
 */
export const chartInkContrast = (alpha: number): string =>
  `hsl(0 0% calc(100% - var(--zf-ink-l, 100%)) / ${alpha})`;

/**
 * A card-surface lightness stop, for a panel that must read as the card rather
 * than as the plot behind it (the event-marker tooltip). Stop 1 is the
 * gradient's top, 3 its bottom; the fallbacks reproduce the original dark
 * values exactly, so a host that publishes no surface vars is unchanged.
 */
const SURFACE_FALLBACK = { 1: "12.5%", 2: "7%", 3: "5.3%" } as const;

export const chartSurface = (stop: 1 | 2 | 3, alpha = 1): string =>
  `hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) var(--zf-surf-l${stop}, ${SURFACE_FALLBACK[stop]}) / ${alpha})`;
