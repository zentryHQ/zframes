import {
  Component,
  Fragment,
  Suspense,
  createContext,
  memo,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  FrameVisibilityContext,
  type FrameVisibility,
  type FrameVisibilityListener,
} from "./visibility";

export type FramePatcher = (patch: Record<string, unknown>) => void;
export const FramePatchContext = createContext<FramePatcher | null>(null);
export function useFramePatch(): FramePatcher | null {
  return useContext(FramePatchContext);
}
import type { FrameRegistry, FrameSource } from "./frame";
import { useProviders } from "./hooks";
import type { FrameInstance } from "./spec";

/**
 * Frame chrome ships as a tiny stylesheet so cards get hover/transition
 * states without the host needing Tailwind. Every value reads a --zf-* var
 * first, so themes (e.g. @zframes/charts theme.css) can restyle the chrome
 * by defining vars — the fallbacks keep zero-config hosts presentable.
 *
 * The accent (indigo by default) is expressed as hsl() off two vars —
 * --zf-accent-hue and --zf-accent-sat — so the host can rotate the entire
 * brand to any hue and dial its vividness from one place (spec.theme →
 * renderer/editor). The dark card *surface* itself is likewise expressed off
 * --zf-base-hue / --zf-base-sat (lightness baked per gradient stop), so the
 * surface can warm/cool/desaturate while staying dark. Accent and surface
 * lightness stay baked per color. Other surface knobs ride their own vars:
 * --zf-border-alpha (rim opacity), --zf-surface-opacity (card translucency),
 * --zf-density (padding scale) and --zf-elevation (shadow depth), all from
 * spec.appearance. Typography rides --zf-font-family (resolved through the
 * --font-dmsans token) and --zf-numeric (digit spacing), both from
 * spec.typography. Every var defaults to the original look, so an unset var
 * renders exactly as before. Semantic colors (error red, success green) and
 * asset logos are intentionally NOT accent-derived — they carry meaning, so
 * they don't rotate.
 *
 * Lives here (not in renderer.tsx) so both the CSS-grid renderer and the
 * interactive editor render identical cards from one source.
 */
export const FRAME_CSS = `
.zf-grid {
  display: grid;
  gap: var(--zf-gap, 12px);
  grid-template-columns: repeat(var(--zf-cols, 12), minmax(0, 1fr));
  grid-auto-rows: var(--zf-row-h, 96px);
  /* Bridge the type family onto the dashboard subtree: redefine --font-dmsans
     HERE (where --zf-font-family is set inline) so the chart utilities and frame
     titles that read var(--font-dmsans) pick up the chosen family. Declaring it
     on this container — not at :root — is what makes the var() substitution see
     the inline --zf-font-family. (The editor mirrors this on .zf-editor.) */
  --font-dmsans: var(--zf-font-family, "DM Sans", sans-serif);
}
/* flow-horizontal: the board is bounded to the viewport height as --zf-h-rows
   equal bands and grows rightward, scrolling sideways. The vertical position
   can't be honoured here (its y runs to 100+ rows), so each frame uses its own
   stored horizontal layout instead: the renderer emits real --zf-col/row-start
   for a frame that HAS a horizontal layout (explicit placement, via the base
   .zf-frame rule), and OMITS them for one that doesn't (the auto var-fallback)
   so grid-auto-flow: column dense packs it by w/h size — the fallback for
   un-edited / agent-generated specs. Column tracks reuse the vertical row height
   (--zf-row-h) so cells stay roughly square. Gated above the phone breakpoint so
   phones keep the single-column reflow below. */
@media (min-width: 641px) {
  .zf-grid.zf-flow-horizontal {
    grid-template-columns: none;
    grid-template-rows: repeat(var(--zf-h-rows, 6), minmax(0, 1fr));
    grid-auto-flow: column dense;
    grid-auto-columns: var(--zf-row-h, 96px);
    height: var(--zf-h-height, calc(100vh - 220px));
    min-height: 420px;
    overflow-x: auto;
    overflow-y: hidden;
    align-content: stretch;
  }
}
.zf-frame {
  grid-column: var(--zf-col-start, auto) / span var(--zf-col-span, 1);
  grid-row: var(--zf-row-start, auto) / span var(--zf-row-span, 1);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* visible (not hidden) so the hover glow on ::after can bleed past the card
     edge exactly like the original box-shadow did. The card itself has nothing
     to clip — its surface/border are rounded by border-radius, and content lives
     in .zf-frame-body which carries the interior clip below. */
  overflow: visible;
  padding: calc(16px * var(--zf-density, 1)) calc(18px * var(--zf-density, 1));
  /* Digit spacing for everything inside the card. Default \`normal\` is a no-op;
     spec.typography.numericStyle="tabular" sets --zf-numeric so live prices stop
     jittering. Hero numerals carry their own tabular-nums regardless. */
  font-variant-numeric: var(--zf-numeric, normal);
  /* Card surface. The three dark stops are expressed off --zf-base-hue /
     --zf-base-sat (spec.theme) with their lightness baked, so the default
     hsl(233 20% …) reproduces the original navy to within ~1/255, while the base
     knobs let the whole surface warm, cool, or desaturate toward black. */
  background: var(--zf-frame-bg, linear-gradient(165deg, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 12.5% / calc(0.82 * var(--zf-surface-opacity, 1))) 0%, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 7% / calc(0.86 * var(--zf-surface-opacity, 1))) 60%, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 5.3% / calc(0.9 * var(--zf-surface-opacity, 1))) 100%));
  border: 1px solid var(--zf-frame-border, hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76% / var(--zf-border-alpha, 0.22)));
  border-radius: var(--zf-frame-radius, 18px);
  box-shadow: var(--zf-frame-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.4), 0 calc(18px * var(--zf-elevation, 1)) calc(44px * var(--zf-elevation, 1)) -26px rgba(0, 0, 0, 0.9));
  /* Hover animates only GPU-composited properties: \`transform\` is the lift,
     \`border-color\` is a cheap 1px paint. The surface brightening + accent glow
     are deliberately NOT transitioned here — animating the gradient \`background\`
     and the large-blur \`box-shadow\` re-rasterized the whole translucent card
     every frame over the animated backdrop, which is what made the hover lag.
     Those now ride the opacity-faded ::after overlay defined below. */
  transition:
    border-color 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  /* Frames arrive in a soft top-down cascade on first paint. The translate
     property (not transform) carries the motion, so the hover lift stays
     independent; the backwards fill holds the hidden state through the stagger
     delay, then hands transform back to :hover once the entrance settles. */
  animation: zf-enter 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)) backwards;
  animation-delay: min(calc((var(--zf-enter-i, 0) + 1) * 35ms), 350ms);
}
/* The brightened surface + accent glow that appear on hover live on this overlay
   and cross-fade via \`opacity\` (GPU-composited) instead of transitioning the
   card's own gradient/box-shadow — both re-rasterize the whole translucent card
   every frame over the animated backdrop, which is what made the hover lag. The
   card is overflow:visible (above), so this layer's OUTER accent shadow bleeds
   past the edge exactly like the original hover did; the layer paints once, then
   only its opacity animates. It sits above the base surface (z-index:0) and below
   the card content (z-index:1) so text and charts stay crisp, and keeps the
   --zf-frame-bg-hover override hook. Errors keep their own red hover (see
   .zf-frame--error), so this is the non-error path. */
.zf-frame:not(.zf-frame--error)::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  background: var(--zf-frame-bg-hover, linear-gradient(165deg, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 16.5% / calc(0.88 * var(--zf-surface-opacity, 1))) 0%, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 9% / calc(0.9 * var(--zf-surface-opacity, 1))) 60%, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 6.3% / calc(0.92 * var(--zf-surface-opacity, 1))) 100%));
  /* The accent half of the original hover shadow, verbatim: brighter top inner
     highlight, a 1px accent ring at the edge, and the soft accent glow pooling
     below and around the card. */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 0 0 1px hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76% / 0.12),
    0 calc(20px * var(--zf-elevation, 1)) calc(60px * var(--zf-elevation, 1)) -28px hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76% / 0.4);
  transition: opacity 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
/* Hover lift is pointer-only — on touch it would stick after a tap. The lift
   (transform) + brighter border transition on the card itself; the surface
   brightening + accent glow ride the ::after overlay's opacity above. */
@media (hover: hover) {
  .zf-frame:hover {
    border-color: var(--zf-frame-border-hover, hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76% / calc(var(--zf-border-alpha, 0.22) + 0.2)));
    transform: translateY(-2px);
  }
  .zf-frame:not(.zf-frame--error):hover::after {
    opacity: 1;
  }
}
/* Top edge sheen — inset past the corner radius so the bright line never
   pokes outside the rounded border (which read as a clipped corner). */
.zf-frame::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
  pointer-events: none;
  z-index: 2;
}
.zf-frame-title {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  font-family: var(--font-dmsans, inherit);
  /* rem (not px) so spec.typography.scale — applied as the root font size by the
     host — grows the card title along with the rem-based chart text it sits above.
     0.625rem = 10px at the default root size, so scale 1 is a no-op. */
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--zf-frame-title, rgba(255, 255, 255, 0.5));
  flex: none;
}
.zf-frame-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--zf-frame-title-dot, hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76%));
  box-shadow: 0 0 8px var(--zf-frame-title-dot-glow, hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76% / 0.9));
}
/* A title with a leading icon (e.g. an asset logo) drops the status dot — the
   logo is the card's identity marker. */
.zf-frame-title--icon::before { display: none; }
/* The title label takes the remaining width and truncates so a long title
   never shoves the source credit off the card. */
.zf-frame-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Data-source credit — a clickable provider link pinned to the right of the
   title row. Brand casing is preserved (text-transform reset) so DeFiLlama /
   alternative.me read correctly against the uppercase title. */
.zf-frame-source {
  margin-left: auto;
  padding-left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
}
.zf-frame-source a {
  color: var(--zf-frame-source, rgba(255, 255, 255, 0.42));
  text-decoration: none;
  transition: color 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  white-space: nowrap;
}
@media (hover: hover) {
  .zf-frame-source a:hover {
    color: var(--zf-frame-source-hover, hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 80%));
    text-decoration: underline;
  }
}
.zf-frame-source-sep { color: rgba(255, 255, 255, 0.22); }
.zf-frame-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Holds the interior clip the card used to own (now overflow:visible so its
     hover glow can escape). The body sits inside the card's padding, so its
     square corners fall within the rounded card and this clip is invisible —
     content/charts/scroll areas clip exactly as before. */
  overflow: hidden;
  /* Skip rendering the (expensive) body — charts, canvases, long lists — while
     the card is scrolled off-screen, so a dashboard with dozens of frames only
     pays layout+paint for what's on screen. Applied to the BODY, not .zf-frame:
     content-visibility implies paint containment, and putting it on the card
     would clip the ::after hover glow that intentionally bleeds past the edge.
     The card's height is fixed by the grid / GridStack (not its content), so
     skipping the body never reflows the card — no scroll jank. contain-intrinsic
     -size feeds a placeholder height for not-yet-rendered cards; the auto keyword
     then remembers each body's real size once it has painted. A no-op for
     on-screen cards. */
  content-visibility: auto;
  contain-intrinsic-size: auto var(--zf-cis-h, 240px);
}
.zf-frame-body > * {
  flex: 1;
  min-height: 0;
}
/* ── Error cards ────────────────────────────────────────────────────────────
   Unknown frame / missing capability / invalid config / runtime crash all share
   one centered empty-state: an alert glyph, a headline naming what's wrong, the
   frame's name, then the specific detail. Centered (not top-left) so the card
   reads as a deliberate state instead of a raw debug dump floating in a void —
   and a faint red top-bloom signals "error" across the whole surface, not just
   the 1px border. This is also the generating agent's feedback surface, so the
   detail stays precise (field paths, the exact missing capability/provider). */
.zf-frame--error {
  border-color: var(--zf-frame-error-border, rgba(242, 21, 83, 0.42));
  background: var(
    --zf-frame-error-bg,
    radial-gradient(125% 80% at 50% -12%, rgba(242, 21, 83, 0.13), transparent 60%),
    linear-gradient(165deg, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 12.5% / 0.82) 0%, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 7% / 0.86) 60%, hsl(var(--zf-base-hue, 233) var(--zf-base-sat, 20%) 5.3% / 0.9) 100%)
  );
  /* Errors are a rare state and never hover-spammed, so they keep the original
     background + box-shadow cross-fade (the GPU-only ::after path is reserved
     for the common, non-error card). */
  transition:
    border-color 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
@media (hover: hover) {
  .zf-frame--error:hover {
    border-color: var(--zf-frame-error-border-hover, rgba(242, 21, 83, 0.6));
    background: var(
      --zf-frame-error-bg,
      radial-gradient(125% 80% at 50% -12%, rgba(242, 21, 83, 0.13), transparent 60%),
      linear-gradient(165deg, rgba(26, 27, 38, 0.82) 0%, rgba(14, 15, 22, 0.86) 60%, rgba(10, 11, 17, 0.9) 100%)
    );
    box-shadow: var(--zf-frame-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.4), 0 18px 44px -26px rgba(0, 0, 0, 0.9)), 0 0 0 1px rgba(242, 21, 83, 0.14), 0 20px 56px -30px rgba(242, 21, 83, 0.4);
  }
}
/* The centered stack. flex:1 lets it claim the whole card; the inner content
   stays its natural height and is centered around the card's middle, so a 2×1
   card and a 6×4 card both read as composed rather than top-anchored. */
.zf-error {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 2px;
  text-align: center;
  overflow: auto;
}
.zf-error-icon {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--zf-frame-error-text, #ff8b9d);
  background: rgba(242, 21, 83, 0.12);
  box-shadow: inset 0 0 0 1px rgba(242, 21, 83, 0.32),
    0 0 24px -8px rgba(242, 21, 83, 0.6);
}
.zf-error-icon svg {
  display: block;
  width: 20px;
  height: 20px;
}
.zf-error-headline {
  font-family: var(--font-dmsans, inherit);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--zf-frame-error-headline, rgba(255, 255, 255, 0.92));
}
.zf-error-frame {
  margin-top: -3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--zf-frame-error-text, #ff8b9d);
}
.zf-error-detail {
  margin: 2px 0 0;
  max-width: 44ch;
  font-size: 12px;
  line-height: 1.5;
  color: var(--zf-frame-error-detail, rgba(255, 255, 255, 0.6));
}
.zf-error-detail code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}
/* Per-issue rows for invalid config: the field path as a code chip, the Zod
   message beside it. Block-centered but left-aligned inside, so a one-field
   error sits dead-centre and a multi-field one reads as a tidy list. */
.zf-error-issues {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}
.zf-error-issue {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(242, 21, 83, 0.18);
}
.zf-error-field {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--zf-frame-error-text, #ff8b9d);
  background: rgba(242, 21, 83, 0.14);
  padding: 1px 6px;
  border-radius: 5px;
}
.zf-error-msg {
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--zf-frame-error-detail, rgba(255, 255, 255, 0.68));
}
/* Registered-frame list under an "unknown frame" card — quiet, it's reference. */
.zf-error-list {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.4);
}
/* Bare frames (headings) divide a dashboard into zones — positioned slot,
   no card chrome, no auto-title. */
.zf-bare {
  grid-column: var(--zf-col-start, auto) / span var(--zf-col-span, 1);
  grid-row: var(--zf-row-start, auto) / span var(--zf-row-span, 1);
  display: flex;
  align-items: flex-end;
  min-height: 0;
  overflow: hidden;
  animation: zf-enter 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)) backwards;
  animation-delay: min(calc((var(--zf-enter-i, 0) + 1) * 35ms), 350ms);
}
/* Phones: the absolute x/y/w grid can't shrink below ~30px columns, so collapse
   to a single full-width column. Frames flow in spec order and keep their row
   span (height), but ignore horizontal placement. */
@media (max-width: 640px) {
  .zf-grid {
    grid-template-columns: 1fr;
  }
  .zf-frame,
  .zf-bare {
    grid-column: 1 / -1;
    grid-row: auto / span var(--zf-row-span, 1);
  }
  .zf-frame {
    padding: calc(12px * var(--zf-density, 1)) calc(14px * var(--zf-density, 1));
  }
}
/* Tablets / small laptops (641-1023px): the absolute grid built for --zf-cols
   columns is too tight here, but a single column wastes the width. Reflow the
   vertical board to two columns — frames auto-place in spec order (dense, so
   gaps backfill), keep their row span, and a frame that spanned at least half
   the design grid takes both columns (--zf-col-span-sm = 2, set by the
   renderer), everything else takes one. flow-horizontal is excluded: it keeps
   its own ≥641px side-scroller. Above 1023px the editable GridStack takes over
   (editing is desktop-only) and the read-only renderer is only the fallback. */
@media (min-width: 641px) and (max-width: 1023px) {
  .zf-grid:not(.zf-flow-horizontal) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-flow: row dense;
  }
  .zf-grid:not(.zf-flow-horizontal) .zf-frame,
  .zf-grid:not(.zf-flow-horizontal) .zf-bare {
    grid-column: auto / span var(--zf-col-span-sm, 1);
    grid-row: auto / span var(--zf-row-span, 1);
  }
}
@keyframes zf-enter {
  from { opacity: 0; translate: 0 10px; }
  to { opacity: 1; translate: 0 0; }
}
/* Reduced-motion entrance: same timing + stagger, but a plain fade with no
   positional movement (motion is what triggers vestibular discomfort). */
@keyframes zf-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .zf-frame,
  .zf-bare {
    animation-name: zf-fade;
  }
  .zf-frame:hover {
    transform: none;
  }
}
/* Suspense fallback while a frame's component chunk loads (lazy registry). A
   quiet pulsing fill sized to the card body — no layout shift since the grid
   item already holds its slot. */
.zf-frame-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  animation: zf-skeleton-pulse 1.2s ease-in-out infinite;
}
@keyframes zf-skeleton-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) {
  .zf-frame-skeleton { animation: none; }
}
`;

/**
 * The clickable data-source credit rendered at the right of a card's title
 * row. Each source opens its provider site in a new tab. `stopPropagation` on
 * pointer-down keeps a click from starting a GridStack drag (or selecting the
 * frame) while customising — the link still navigates on click.
 */
/**
 * The alert glyph shared by every error card (and the crash boundary). Inlined
 * as an SVG so core never depends on a host icon set; `currentColor` lets it
 * inherit the error tint from `.zf-error-icon`.
 */
const AlertGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

/**
 * The centered error-card layout shared by the unknown-frame, missing-capability
 * and invalid-config branches: alert glyph → headline → frame name → detail.
 * `outerClassName` carries the full `zf-frame zf-frame--error …` chrome from the
 * call site so placement (grid style / editor fill) round-trips unchanged.
 */
function ErrorCard({
  outerClassName,
  style,
  headline,
  frame,
  children,
}: {
  outerClassName: string;
  style?: CSSProperties;
  headline: string;
  frame: string;
  children: ReactNode;
}) {
  return (
    <div className={outerClassName} style={style}>
      <div className="zf-error">
        <span className="zf-error-icon">
          <AlertGlyph />
        </span>
        <div className="zf-error-headline">{headline}</div>
        <div className="zf-error-frame">{frame}</div>
        {children}
      </div>
    </div>
  );
}

function SourceCredit({ sources }: { sources: FrameSource[] }) {
  if (sources.length === 0) return null;
  return (
    <span className="zf-frame-source">
      {sources.map((source, i) => (
        <Fragment key={source.url}>
          {i > 0 && <span className="zf-frame-source-sep">·</span>}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            title={`Data source: ${source.name}`}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {source.name}
          </a>
        </Fragment>
      ))}
    </span>
  );
}

class FrameErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      // Runtime crash inside an otherwise-valid card: reuse the centered
      // error stack so it sits in the body the card already framed.
      return (
        <div className="zf-error">
          <span className="zf-error-icon">
            <AlertGlyph />
          </span>
          <div className="zf-error-headline">Frame crashed</div>
          <p className="zf-error-detail">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Renders a single frame instance — the card chrome, the error cards (unknown
 * frame / missing capability / invalid config), and the frame component itself.
 *
 * It deliberately owns only the *content*, not placement: the host positions
 * the returned element. The CSS-grid renderer passes a `style` with grid
 * coordinates; the editor lets GridStack position the wrapper and passes a
 * fill `className`. Both get pixel-identical cards from this one component.
 */
const cx = (...c: string[]) => c.filter(Boolean).join(" ");

/**
 * The chrome for a valid (non-error, non-bare) frame. Split out from
 * FrameContent so it can own a per-card IntersectionObserver and publish the
 * card's viewport visibility (a stable ref + pub/sub, created once) down to the
 * frame's data hooks via context — which is why `children` (the frame
 * component) renders INSIDE the Provider. The observer toggles `visibleRef` and
 * notifies subscribers ~200px before the card enters/leaves the viewport, so
 * `usePolled` can pause off-screen polling and refetch on return without any
 * extra render. A visual no-op: identical markup to the inline card it replaces.
 */
function ValidFrameCard({
  style,
  className,
  hasIcon,
  titleIcon,
  title,
  sources,
  children,
}: {
  style?: CSSProperties;
  className: string;
  hasIcon: boolean;
  titleIcon: ReactNode;
  title: string;
  sources: FrameSource[];
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(true);
  const listenersRef = useRef<Set<FrameVisibilityListener> | null>(null);
  if (!listenersRef.current) listenersRef.current = new Set();
  const visibilityRef = useRef<FrameVisibility | null>(null);
  if (!visibilityRef.current) {
    const listeners = listenersRef.current;
    visibilityRef.current = {
      visibleRef,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const visible = entry.isIntersecting;
        if (visible === visibleRef.current) return;
        visibleRef.current = visible;
        for (const listener of [...listenersRef.current!]) listener(visible);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <FrameVisibilityContext.Provider value={visibilityRef.current}>
      <div ref={cardRef} className={cx("zf-frame", className)} style={style}>
        <div className={cx("zf-frame-title", hasIcon ? "zf-frame-title--icon" : "")}>
          {titleIcon}
          <span className="zf-frame-title-text">{title}</span>
          <SourceCredit sources={sources} />
        </div>
        <div className="zf-frame-body">{children}</div>
      </div>
    </FrameVisibilityContext.Provider>
  );
}

function FrameContentImpl({
  instance,
  registry,
  style,
  className = "",
}: {
  instance: FrameInstance;
  registry: FrameRegistry;
  style?: CSSProperties;
  className?: string;
}) {
  const providers = useProviders();
  const def = registry.get(instance.frame);

  if (!def) {
    return (
      <ErrorCard
        outerClassName={cx("zf-frame", "zf-frame--error", className)}
        style={style}
        headline="Unknown frame"
        frame={instance.frame}
      >
        <p className="zf-error-detail">
          <code>{instance.frame}</code> isn&rsquo;t a registered frame.
        </p>
        <p className="zf-error-list">
          Available: {[...registry.keys()].join(", ")}
        </p>
      </ErrorCard>
    );
  }

  // A frame whose data needs no provider covers renders as an error card,
  // not a permanently-empty widget — generating agents read this and pick
  // frames the host can actually feed.
  const covered = new Set(providers.flatMap((p) => [...p.capabilities]));
  const missing = def.capabilities.filter((c) => !covered.has(c));
  if (missing.length > 0) {
    return (
      <ErrorCard
        outerClassName={cx("zf-frame", "zf-frame--error", className)}
        style={style}
        headline="No data source"
        frame={instance.frame}
      >
        <p className="zf-error-detail">
          No registered provider supplies{" "}
          {missing.map((c, i) => (
            <Fragment key={c}>
              {i > 0 && ", "}
              <code>{c}</code>
            </Fragment>
          ))}
          .
        </p>
      </ErrorCard>
    );
  }

  // Per-frame validation failures render as readable error cards instead of
  // breaking the dashboard — this is the feedback surface a generating agent
  // (or a human editing config) reads to self-correct.
  const parsed = def.schema.safeParse(instance.config);
  if (!parsed.success) {
    return (
      <ErrorCard
        outerClassName={cx("zf-frame", "zf-frame--error", className)}
        style={style}
        headline="Invalid configuration"
        frame={instance.frame}
      >
        <ul className="zf-error-issues">
          {parsed.error.issues.map((issue, i) => (
            <li className="zf-error-issue" key={i}>
              <code className="zf-error-field">
                {issue.path.join(".") || "(root)"}
              </code>
              <span className="zf-error-msg">
                {issue.message.replace(/^Invalid input:\s*/i, "")}
              </span>
            </li>
          ))}
        </ul>
      </ErrorCard>
    );
  }

  const FrameComponent = def.component;
  const TitleIcon = def.titleIcon;
  const sources = def.source
    ? Array.isArray(def.source)
      ? def.source
      : [def.source]
    : [];

  // Bare frames (e.g. headings) structure a dashboard into zones — they get a
  // positioned slot but no card chrome and no auto-title.
  if (def.chrome === "bare") {
    return (
      <div className={cx("zf-bare", className)} style={style}>
        <FrameErrorBoundary>
          <Suspense fallback={null}>
            <FrameComponent config={parsed.data} />
          </Suspense>
        </FrameErrorBoundary>
      </div>
    );
  }

  return (
    <ValidFrameCard
      style={style}
      className={className}
      hasIcon={!!TitleIcon}
      title={instance.title ?? instance.frame.replace(/-/g, " ")}
      sources={sources}
      titleIcon={
        TitleIcon ? (
          <Suspense fallback={null}>
            <TitleIcon config={parsed.data} />
          </Suspense>
        ) : null
      }
    >
      <FrameErrorBoundary>
        <Suspense fallback={<div className="zf-frame-skeleton" />}>
          <FrameComponent config={parsed.data} />
        </Suspense>
      </FrameErrorBoundary>
    </ValidFrameCard>
  );
}

/**
 * Memoized so a host re-render that leaves a frame's props untouched (e.g. the
 * one-tree DashboardRenderer re-rendering when something elsewhere changes)
 * doesn't re-run this card's safeParse + capability check. Inert unless the
 * caller also keeps `style`/`instance` referentially stable — the renderer
 * memoizes its per-frame style array for exactly this reason.
 */
export const FrameContent = memo(FrameContentImpl);
