import type { ReactNode } from "react";

/**
 * Sizing a figure that has to sit inside a ring's hole.
 *
 * `PieChart` and `RadialGauge` centre slots span the whole chart box — they must,
 * or the arc beneath them can't be hovered — so a readout laid out in one has no
 * idea how much room the ring actually left it, and a fixed `metric-*` size runs
 * out over the arc as soon as the card is small. Both charts publish the hole's
 * measured diameter as a CSS var (`--zf-pie-hole` / `--zf-gauge-hole`); this
 * turns that into a font size.
 */

/** DM Sans Bold's tabular advance, in em. Digits and `%` are the common case. */
const GLYPH_EM = 0.62;

/**
 * A `font-size` that keeps `content` inside the hole named by `holeVar`, never
 * exceeding `max`.
 *
 * `min()` is what makes this safe to apply everywhere: a card with room keeps
 * exactly the type it had before, and only a hole too small for `max` shrinks
 * it. Returns `undefined` for non-text children — guessing a width for
 * arbitrary nodes would shrink type that fits.
 *
 * @param fraction How much of the hole's diameter the text may use across.
 *   Default 0.8, which leaves air at the sides: the readout sits near the
 *   vertical middle of a circle, so it never gets the full chord, and a figure
 *   touching the arc reads as broken even when it technically clears it.
 * @param height Cap as a share of the hole, for the OTHER axis. A short string
 *   in a small hole is width-limited by nothing at all (one glyph at 1.29x the
 *   diameter still "fits" across), and a line box is about as tall as its font
 *   size, so without this a 36px figure sat in a 33px hole.
 */
export function holeFontSize(
  content: ReactNode,
  holeVar: string,
  max: string,
  {
    fraction = 0.8,
    height = 0.75,
  }: { fraction?: number; height?: number } = {},
): string | undefined {
  const chars = charCount(content);
  if (chars === 0) return undefined;
  const ratio = Math.min(height, fraction / (GLYPH_EM * chars));
  return `min(${max}, calc(var(${holeVar}, 999px) * ${ratio.toFixed(4)}))`;
}

/** Rendered characters of a text-ish node; 0 when it isn't text at all. */
export function charCount(node: ReactNode): number {
  if (typeof node === "string" || typeof node === "number")
    return String(node).length;
  if (Array.isArray(node))
    return node.reduce((sum: number, child) => sum + charCount(child), 0);
  return 0;
}
