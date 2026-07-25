# 002 — Make chart tooltips instant and crisp (kill the 400ms delay, 150ms fades, ease-out exits)

- **Status**: DONE (landed on main, 74128c8, 2026-07-11)
- **Commit**: 4003be6
- **Severity**: HIGH
- **Category**: 2 — Easing & duration (plus 3 physicality)
- **Estimated scope**: 4 files in `packages/charts/src`, ~10 value changes

## Problem

Chart tooltips are the single most frequent chart interaction (every hover on every chart, in both the explorer site's previews and the runtime dashboard). The audit playbook's budget for tooltips is **125–200ms**, appearing without dead delay. Current state:

**A. Heatmap + treemap tooltips wait 400ms before showing.** On first hover into the chart: 400ms `transition-delay` + 200ms fade ≈ 600ms before the tooltip is readable. (Cell-to-cell within the container is instant via an else-branch — that part is correct and must stay.) The entrance also pops from `scale(0.6)`, well below the playbook's 0.9–0.97 entrance band.

```tsx
// packages/charts/src/heatmap-chart/hooks/use-heatmap-tooltip.tsx:47 — current
const { verticalOffset = 10, delay = 400 } = options;
```

```tsx
// packages/charts/src/heatmap-chart/hooks/use-heatmap-tooltip.tsx:~120-134 — current
if (!isTooltipVisibleRef.current) {
  wrapperRef.current.style.transition = "none";
  wrapperRef.current.style.opacity = "0";
  wrapperRef.current.style.transform = "scale(0.6)";

  requestAnimationFrame(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transitionProperty =
        "opacity, transform";
      wrapperRef.current.style.transitionDuration = "0.2s";
      wrapperRef.current.style.transitionDelay = `${delay}ms`;
      wrapperRef.current.style.transitionTimingFunction =
        "var(--ease-out-quart)";
      wrapperRef.current.style.opacity = "1";
      wrapperRef.current.style.transform = "scale(1.0)";
    }
```

```tsx
// packages/charts/src/tree-chart/hooks/use-treemap-tooltip.tsx:9 — current (near-identical duplicate hook)
const { verticalOffset = 10, delay = 400 } = options;
// ...same scale(0.6) / 0.2s / `${delay}ms` block at ~lines 82-95
```

**B. Multi-series line-chart tooltip fades over 300ms; the desktop variant has no easing utility, so it inherits Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` — an ease-in-out that starts slow.** JS flips its opacity on every hover/leave, so this runs constantly.

```tsx
// packages/charts/src/multi-series-line-chart/components/chart-tooltip.tsx:29 — current (desktop)
className="pointer-events-none absolute left-0 top-0 z-50 rounded-md bg-slate-700 px-6 py-3 text-xs text-white opacity-0 transition-opacity duration-300"
```

```tsx
// packages/charts/src/multi-series-line-chart/components/chart-tooltip.tsx:78 — current (mobile)
className="pointer-events-none absolute left-0 top-0 z-50 min-w-[130px] rounded-md bg-slate-700 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-300 ease-out"
```

**C. The hover-dot EXIT uses `d3.easeBackIn` — an anticipation curve that starts slow (the ease-in anti-pattern, "always a finding"), on the constant hover-out path.** Exits should snap with an ease-out.

```ts
// packages/charts/src/multi-series-line-chart/d3-rendering/create-interactions.ts:~290-296 — current
hoverDots
  .selectAll("g")
  .transition()
  .duration(150)
  .ease(d3.easeBackIn)
  .style("opacity", 0)
```

(The matching ENTER at ~line 122-124 — `.duration(200).ease(d3.easeBackOut)` — keeps its subtle overshoot; do not change it.)

## Target

Exact values (from the playbook: tooltips 125–200ms; entrances scale 0.9–0.97; exits ease-out):

- Heatmap + treemap hooks: `delay = 100` (default), `transitionDuration = "0.15s"`, entrance `scale(0.94)` → `scale(1.0)`. The `var(--ease-out-quart)` timing function and the instant within-container else-branch stay as they are.
- Line-chart tooltip (both variants): `transition-opacity duration-150 ease-out`.
- Hover-dot exit: `.duration(120).ease(d3.easeCubicOut)` — keep the fade to `opacity 0` and the `scale(0.3)` exit target (shrinking on exit is fine; only entrances have the 0.9–0.97 floor).

## Repo conventions to follow

- The charts package uses its own `--ease-out-quart` token (`packages/charts/src/theme.css:53`) in the tooltip hooks — keep using it there; do not introduce `--zf-ease-out` in this plan.
- Tailwind utility classes in chart components (e.g. `chart-legend.tsx:42` uses `transition-opacity duration-200 ease-out`) — that legend line is the in-package exemplar of correct tooltip-ish timing.
- d3 easings are imported via the namespace `d3.` in `create-interactions.ts` — `d3.easeCubicOut` follows the existing pattern (`d3.easeBackOut`, `d3.easeLinear` already used there).

## Steps

1. `packages/charts/src/heatmap-chart/hooks/use-heatmap-tooltip.tsx`:
   a. Line 47: `delay = 400` → `delay = 100`.
   b. In the first-show block (~line 120-134): `"scale(0.6)"` → `"scale(0.94)"`; `transitionDuration = "0.2s"` → `"0.15s"`.
2. `packages/charts/src/tree-chart/hooks/use-treemap-tooltip.tsx`:
   a. Line 9: `delay = 400` → `delay = 100`.
   b. In its first-show block (~line 82-95): `"scale(0.6)"` → `"scale(0.94)"`; `transitionDuration = "0.2s"` → `"0.15s"`.
3. `packages/charts/src/multi-series-line-chart/components/chart-tooltip.tsx`:
   a. Line 29 (desktop): `transition-opacity duration-300` → `transition-opacity duration-150 ease-out`.
   b. Line 78 (mobile): `transition-opacity duration-300 ease-out` → `transition-opacity duration-150 ease-out`.
4. `packages/charts/src/multi-series-line-chart/d3-rendering/create-interactions.ts` (~line 290-296): in the mouse-leave hoverDots transition, `.duration(150)` → `.duration(120)` and `.ease(d3.easeBackIn)` → `.ease(d3.easeCubicOut)`.

## Boundaries

- Do NOT touch the hover-dot ENTER transition (`easeBackOut`, ~line 122), the tooltip position-tracking code (translate3d with `transition: none` — already correct), the within-container instant else-branches, or any other chart file.
- Do NOT deduplicate the two tooltip hooks in this plan (they're near-identical, but consolidation is a separate refactor).
- Do NOT add dependencies.
- If a cited line doesn't match, STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` from the repo root — passes.
- **Feel check**: run Storybook (`pnpm --filter @zframes/storybook dev`, port 6006) and open a heatmap frame story, a treemap story, and a multi-series line chart story (e.g. price-compare):
  - Hover into the heatmap: the tooltip appears essentially immediately (~100ms intent gate), not after a beat. Moving cell-to-cell inside stays instant.
  - The tooltip entrance reads as a small settle (0.94 → 1), not a zoom-in.
  - Line chart: sweep the cursor across and off the plot repeatedly — the tooltip and hover dots appear/disappear crisply; the dot exit must not "wind up" (pause, then shrink) — it should start shrinking the instant the cursor leaves. Slow to 10% in the DevTools Animations panel to confirm the exit starts at full speed.
- **Done when**: all three chart types show/hide tooltips within the 125–200ms envelope with no perceptible entry delay beyond the 100ms intent gate.
