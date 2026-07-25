# 004 — Add prefers-reduced-motion support to @zframes/charts

- **Status**: DONE (landed on main, 12f43de, 2026-07-11)
- **Commit**: 4003be6
- **Severity**: MEDIUM
- **Category**: 6 — Accessibility
- **Estimated scope**: 6 files in `packages/charts/src`, plus one shared helper

## Problem

`@zframes/charts` has **zero** `prefers-reduced-motion` handling (grep-confirmed) while every other layer of the product gates its motion (`packages/frames/src/marquee.tsx:45`, `packages/core/src/frame-content.tsx:473`, `packages/editor/src/editor.css` ×6, both apps). Charts run on every dashboard, so this is the largest remaining a11y gap. Ungated motion:

1. **LoadingOrb** — the DNA-strand loader shown on every chart load animates `translate` + `scale` + `background-color`, 2s infinite, on 10 dots. Keyframes in `packages/charts/src/loading-orb/loading-orb.css`; the animations are attached via **inline styles** in `packages/charts/src/loading-orb/index.tsx`:

```tsx
// packages/charts/src/loading-orb/index.tsx — current (strand 1; strand 2 identical shape)
<div
  key={`strand1-${index}`}
  className="absolute size-1.5 rounded-full will-change-transform"
  style={{
    left: `${(index / 6) * 100}%`,
    animation: `dnaStrand1Move 2s infinite ease-in-out ${-index * 0.2}s, dnaStrand1Scale 2s infinite ease-in-out ${-index * 0.2}s, dnaStrand1Color 2s infinite ease-in-out ${-index * 0.2}s`,
  }}
></div>
```

2. **Line-draw reveal** — 1200ms stroke-dashoffset draw on first mount, no reduced-motion escape (the code already HAS an instant path — the `animate` boolean — it's just never driven by the media query):

```ts
// packages/charts/src/multi-series-line-chart/index.tsx:172-179 — current
drawLines(
  g,
  filteredSeries,
  seriesColors,
  xScale,
  yScale,
  !hasAnimatedRef.current,
);
hasAnimatedRef.current = true;
```

3. **Hover-dot pop** — `create-interactions.ts` enter (~line 122, `.duration(200).ease(d3.easeBackOut)`) and exit (~line 293, `.duration(150)` — may read `.duration(120).ease(d3.easeCubicOut)` if plan 002 landed first; either is fine) transitions run regardless of the setting.

4. **Pie hover glow** — `packages/charts/src/pie-chart.tsx:127` and `:134`, `.transition().duration(300)` on mouseenter/mouseleave.

5. **Stacked-area spinner** — `packages/charts/src/stacked-area-chart/index.tsx:269` uses a bare `animate-spin` with no `motion-reduce` variant.

Reduced motion means **fewer and gentler, not zero**: keep opacity/color state feedback (the user must still see "loading"), drop translate/scale movement.

## Target

- A shared `prefersReducedMotion()` helper in `packages/charts/src/lib/utils.ts` (SSR-safe), used by all d3/JS call sites:

```ts
/** True under `prefers-reduced-motion: reduce`. SSR-safe (false on the server). */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
```

- LoadingOrb dots get a class hook (`loading-orb-dot`) and a CSS override that replaces the strand choreography with a gentle opacity pulse (state feedback survives, movement doesn't). Append to `packages/charts/src/loading-orb/loading-orb.css`:

```css
@keyframes dnaPulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.8; }
}
@media (prefers-reduced-motion: reduce) {
  /* !important beats the inline `animation` shorthand on the dots. Movement
     (translate/scale) and the color cycle stop; a soft opacity pulse keeps
     the "loading" signal. */
  .loading-orb-dot {
    animation: dnaPulse 2s ease-in-out infinite !important;
    background-color: hsl(var(--zf-accent-hue, 242) 100% 68%);
  }
}
```

- Line draw: skipped entirely under reduced motion (lines appear instantly — the existing `animate=false` path).
- Hover dots + pie glow: `duration(0)` under reduced motion (instant show/hide — opacity feedback kept, motion dropped).
- Stacked-area spinner: `motion-reduce:animate-none` (Tailwind's built-in variant) plus nothing else — the "Loading…" text next to it (if any) or the static ring still reads.

## Repo conventions to follow

- The JS matchMedia pattern already exists in-repo: `packages/editor/src/editor.tsx:1246-1248` (`window.matchMedia?.("(prefers-reduced-motion: reduce)").matches`). Mirror its optional-chaining style.
- The CSS pattern exemplar is `packages/frames/src/marquee.tsx:45` (`@media (prefers-reduced-motion: reduce) { … animation: none … }`).
- `packages/charts/src/lib/utils.ts` currently exports `cn` — append the helper there, matching its export style.

## Steps

1. `packages/charts/src/lib/utils.ts`: append the `prefersReducedMotion` export (exact code in Target).
2. `packages/charts/src/loading-orb/index.tsx`: add `loading-orb-dot` to BOTH dot `className`s (strand 1: `"loading-orb-dot absolute size-1.5 rounded-full will-change-transform"`, strand 2: `"loading-orb-dot absolute size-1.5 rounded-full"`).
3. `packages/charts/src/loading-orb/loading-orb.css`: append the `dnaPulse` keyframes + media block (exact CSS in Target).
4. `packages/charts/src/multi-series-line-chart/index.tsx` (~line 172): import `prefersReducedMotion` from `../lib/utils` and change the drawLines animate argument to `!hasAnimatedRef.current && !prefersReducedMotion()`.
5. `packages/charts/src/multi-series-line-chart/d3-rendering/create-interactions.ts`: import the helper; in the hover-dot ENTER transition change `.duration(200)` to `.duration(prefersReducedMotion() ? 0 : 200)`, and in the EXIT transition change its duration the same way (`.duration(prefersReducedMotion() ? 0 : <current value>)`).
6. `packages/charts/src/pie-chart.tsx:127` and `:134`: change both `.duration(300)` to `.duration(prefersReducedMotion() ? 0 : 300)` (import the helper).
7. `packages/charts/src/stacked-area-chart/index.tsx:269`: add `motion-reduce:animate-none` next to `animate-spin`.

## Boundaries

- Do NOT change any normal-motion durations, easings, or the color keyframes in this plan (crisping timings is plans 002/005 territory).
- Do NOT dedupe the tooltip hooks or touch tooltip code — tooltips are position+opacity and already acceptable under reduced motion.
- Do NOT add a React hook/subscription for the media query — a read-at-interaction-time check matches the repo's existing pattern and is enough (the setting rarely changes mid-session).
- Do NOT add dependencies.
- If a cited excerpt doesn't match (e.g. plan 002 changed the exit duration/easing), adapt ONLY the literal current duration into the ternary; anything else that mismatches → STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` passes.
- **Feel check**: run Storybook (`pnpm --filter @zframes/storybook dev`, :6006), open DevTools Rendering panel and emulate `prefers-reduced-motion: reduce`:
  - A frame story in the `loading` state: the DNA dots stop travelling/scaling and instead pulse opacity gently in the accent color. Turn emulation off → full choreography returns (may need a reload; inline styles re-attach on mount).
  - A multi-series line chart story: lines appear instantly (no 1200ms draw); hovering shows/hides dots and tooltip instantly with no scale pop.
  - A pie chart story: hover glow appears instantly.
  - A stacked-area story in loading state: spinner is static.
  - With emulation OFF, confirm every one of the above behaves exactly as before the change.
- **Done when**: under reduced-motion emulation no chart element translates or scales, while loading state and hover feedback remain visible.
