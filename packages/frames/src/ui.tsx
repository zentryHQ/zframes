import { useMoney, type Money } from "@zframes/core";
import type { ReactNode } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * The standard-property half of the scrollbar treatment, for the browsers that
 * implement none of the `-webkit-` pseudo-elements.
 *
 * Without it Firefox painted its full-width OS scrollbar into a gutter sized
 * for a six-pixel thumb, so the last column of every list sat under the track —
 * exactly what the gutter (`pr-1` / `pb-1`) exists to prevent.
 *
 * `hsla()`'s legacy comma syntax, not the modern `hsl(… / α)` slash form: these
 * are Tailwind arbitrary properties, where a `/` reads as the start of an
 * opacity modifier. `var()` substitution is textual, so the legacy function
 * resolves the same way. The lightness comes from the board's `--zf-ink-l` so
 * the thumb darkens with a Light surface instead of staying white-on-white.
 *
 * Written out in full, never composed from parts: Tailwind finds class
 * candidates by scanning the SOURCE TEXT, so a name assembled at runtime
 * generates no CSS at all.
 */
const SCROLLBAR = [
  "[scrollbar-width:thin]",
  "[scrollbar-color:hsla(0,0%,var(--zf-ink-l,100%),0.08)_transparent]",
  "hover:[scrollbar-color:hsla(0,0%,var(--zf-ink-l,100%),0.15)_transparent]",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full",
  "[&::-webkit-scrollbar-thumb]:bg-[hsla(0,0%,var(--zf-ink-l,100%),0.08)]",
  "hover:[&::-webkit-scrollbar-thumb]:bg-[hsla(0,0%,var(--zf-ink-l,100%),0.15)]",
].join(" ");

/**
 * Shared scroll-area styling for list/feed frames: claims the remaining height,
 * scrolls vertically, and renders a thin, quiet scrollbar that brightens on
 * hover (webkit pseudo-elements plus the standard properties above). `pr-1`
 * keeps row content off the scrollbar track so the last column never sits under
 * the thumb.
 */
export const scrollAreaClass = `min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 ${SCROLLBAR}`;

/**
 * Horizontal counterpart to {@link scrollAreaClass} for strips that scroll on
 * the x-axis (e.g. a row of projected-block / candle tiles). Same quiet, thin
 * thumb that brightens on hover; `pb-1` keeps content off the scrollbar track.
 */
export const scrollAreaXClass = `min-w-0 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 ${SCROLLBAR}`;

/**
 * Line box a `caption`-sized figure needs before it starts clipping against the
 * top and bottom of its cell. A matrix card packs rows far tighter than columns
 * — 20 years of monthly returns leaves ~13px a row — so a width-only guard lets
 * a number render sliced in half.
 */
const MIN_CELL_LABEL_HEIGHT = 13;

/**
 * Should a matrix cell print its figure at this size? Every `HeatmapChart` frame
 * routes its `CellComponent` text through this instead of its own `width < 44`
 * check: the colour already carries the reading, so below the fit the label is
 * dropped and the cell stays clean rather than clipped.
 *
 * `minWidth` is per-frame (a `+12.34%` needs more room than a `0.82`); the
 * height floor is shared, since every frame draws the figure at `caption` size.
 */
export function cellLabelFits(
  width: number,
  height: number,
  minWidth: number,
): boolean {
  return width >= minWidth && height >= MIN_CELL_LABEL_HEIGHT;
}

/**
 * Builds a heatmap's `CellComponent` from just its figure.
 *
 * Five matrix frames — `coin-momentum-heatmap`, `funding-heatmap`,
 * `fx-cross-heatmap`, `funding-venue-heatmap`, `options-oi-ladder-heatmap` —
 * declared a byte-identical local `Cell`: the same `cellLabelFits` gate, the
 * same centring flexbox, the same `caption text-normal tabular-nums` span. Only
 * the formatter wrapping the datum and the `minWidth` differed.
 *
 *     const Cell = heatmapCellLabel<FundingCell>(
 *       (d) => formatFundingPct(d.rate * 100),
 *       44,
 *     );
 *
 * The `cellLabelFits` call moves in here, which is why
 * `tests/heatmap-label-fit.test.ts` accepts this factory as satisfying the same
 * requirement — a frame is compliant when it routes its figure through EITHER,
 * because both lead to the one width-AND-height gate.
 *
 * A factory, not a compound component: `HeatmapChart` computes each cell's
 * geometry and renders N instances of what it is handed, so `width`/`height`
 * can only arrive as props.
 */
export function heatmapCellLabel<T>(
  format: (data: T, money: Money) => string,
  minWidth = 44,
) {
  return function Cell({
    data,
    width,
    height,
  }: {
    data: T;
    width: number;
    height: number;
  }) {
    // Before the fit gate, always: a hook behind an early return is a hook
    // that sometimes doesn't run, and the gate bails on most cells of a dense
    // matrix.
    const money = useMoney();
    if (!cellLabelFits(width, height, minWidth)) return null;
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="caption text-normal tabular-nums">
          {format(data, money)}
        </span>
      </div>
    );
  };
}

/**
 * The skeleton's bars, against the board's ink rather than a literal white: the
 * surface rule flips `--zf-ink-l` to 16% on a Light board, and four percent of
 * white over a near-white card is nothing at all.
 */
const barFill = (alpha: number) => ({
  background: `hsl(0 0% var(--zf-ink-l, 100%) / ${alpha})`,
});

/**
 * Shared loading / empty placeholder for frames. Loading gets a real widget
 * skeleton instead of text-only pulse; empty states stay quiet and readable.
 *
 * The pulse and the ping are gated on the live reduced-motion preference. The
 * equivalent fill in the card chrome (`@zframes/core`'s `.zf-frame-skeleton`)
 * is CSS and gates itself with a media query; this one is Tailwind's
 * `animate-*`, so the gate has to be the hook. It reads the query live, so
 * flipping the setting reaches a card that is already on screen.
 */
export function FrameStatus({
  loading = false,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const pulse = reduced ? "" : "animate-pulse";

  if (loading) {
    return (
      <div
        className="flex h-full min-h-[72px] w-full items-center justify-center overflow-hidden rounded-md"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className="relative h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: "hsl(var(--zf-accent-hue, 242) 90% 76%)",
                boxShadow:
                  "0 0 12px hsl(var(--zf-accent-hue, 242) 90% 76% / 0.72)",
              }}
            >
              {!reduced && (
                <span
                  className="absolute inset-0 animate-ping rounded-full opacity-60"
                  style={{
                    background: "hsl(var(--zf-accent-hue, 242) 90% 76%)",
                  }}
                />
              )}
            </span>
            <span className="body-sm text-soft truncate">{children}</span>
          </div>
          <div className="grid min-h-0 grid-cols-4 gap-2">
            <span className={`h-11 rounded ${pulse}`} style={barFill(0.07)} />
            <span className={`h-11 rounded ${pulse}`} style={barFill(0.05)} />
            <span className={`h-11 rounded ${pulse}`} style={barFill(0.08)} />
            <span className={`h-11 rounded ${pulse}`} style={barFill(0.04)} />
          </div>
          <div className="flex flex-col gap-2">
            <span
              className={`h-2.5 w-11/12 rounded-full ${pulse}`}
              style={barFill(0.07)}
            />
            <span
              className={`h-2.5 w-7/12 rounded-full ${pulse}`}
              style={barFill(0.05)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="body-sm text-soft flex h-full min-h-0 items-center justify-center text-center"
      // MACHINE-READABLE EMPTY STATE. A frame that has resolved with no data is
      // NOT `aria-busy` — it looks finished to anything watching the DOM. The
      // nightly thumbnail capture waited only for busy states to clear and so
      // photographed boards mid-warm-up, publishing a shot full of "no history
      // yet" cards; `apps/explorer/scripts/capture-thumbs.ts` now waits on this
      // attribute and refuses to overwrite a good thumb with such a shot.
      //
      // It is deliberately NOT `role="status"`/`aria-busy` — those would lie to
      // a screen reader about work still being in progress.
      data-zf-empty="true"
    >
      {children}
    </div>
  );
}
