/**
 * Measure a string's rendered width via a shared canvas 2D context.
 *
 * For axis gutters that have to be sized BEFORE the text exists in the DOM: a
 * fixed margin either clips a wide label ("$40.00T" under a 50px gutter) or
 * wastes half the card on a narrow one, and `getBBox` needs a mounted node,
 * which is null on the first render pass that decides the margin.
 *
 * One context per font string, kept module-level — creating a canvas per
 * measurement is the expensive part, and axis labels re-measure on every
 * resize.
 */
const contexts = new Map<string, CanvasRenderingContext2D | null>();

function contextFor(font: string): CanvasRenderingContext2D | null {
  const cached = contexts.get(font);
  if (cached !== undefined) return cached;
  const ctx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  if (ctx) ctx.font = font;
  contexts.set(font, ctx);
  return ctx;
}

/**
 * @param font A CSS `font` shorthand, e.g. `500 12px "DM Sans", sans-serif`.
 *   Must include a size — a shorthand without one is invalid and silently
 *   leaves the context at its 10px default.
 */
export function measureTextWidth(text: string, font: string): number {
  const ctx = contextFor(font);
  // SSR / jsdom (no canvas): estimate ~0.62em per glyph, from the size in the
  // shorthand. Overestimating is the safe direction for a gutter.
  if (!ctx) {
    const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
    return text.length * size * 0.62;
  }
  return ctx.measureText(text).width;
}
