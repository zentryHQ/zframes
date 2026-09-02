# @zframes/charts

The D3 base chart layer. A zero-`@zframes`-dependency leaf: it must stay generic.

**Cardinal rule.** Base charts stay generic — no business logic, no data fetching; frames own data, charts own rendering.

## What ships

D3 base chart layer ported from zTerminal (`tree-chart`, `heatmap-chart`, `multi-series-line-chart`, `stacked-area-chart`, `pie-chart`, `mini-line-chart`) plus in-house additions (`bar-chart`, vertical/horizontal, diverging-aware; `scatter-chart`, x/y bubble, linear/log y; `radial-gauge`, bounded-scalar arc with a center slot; `histogram-chart`, a binned distribution with optional markers, shipping the stats kernel frames reuse (`binSample`/`chooseBinWidth`/`normalCurve`/`quantile`/`sampleStats`); `bubble-chart`, packed circles sized by magnitude; `calendar-heatmap`, a day-grid year view) and `theme.css` (zTerminal design tokens for Tailwind v4). `multi-series-line-chart` also takes an optional `events: ChartEvent[]` and overlays an `EventLayer` (dashed rule + top flag + hover/focus tooltip, neighbours within 18px clustered, out-of-window markers dropped) — generic annotations the caller supplies (in practice the card's own), not a data source. Implementation-agnostic: no business logic, no data fetching.

`loading-orb/` is internal (used by `multi-series-line-chart`), deliberately not
exported.

## Chrome follows the board's surface (`lib/ink.ts`)

Axis rules, tick labels, crosshairs, knobs and panel backgrounds are **chart
chrome**, and the board flips them: the renderer publishes `--zf-ink-l` (100%
dark / 16% light) and `--zf-surf-l1..3` on the grid container. Derive them via
`chartInk()` / `chartInkContrast()` / `chartSurface()`, or plain `currentColor`
where the mark already inherits the card's colour — never a literal `#FFFFFF`,
which is invisible on a light board.

**The footgun:** those helpers return an `hsl()` containing `var()`, and a
`var()` is NOT substituted inside an SVG *presentation attribute*. In D3 they
must go through `.style("stroke", …)` (or a class); `.attr("stroke", …)` paints
nothing at all. Same for a React SVG element: `style={{ stroke: chartInk() }}`,
not `stroke={chartInk()}`. The two zTerminal ports (`multi-series-line-chart`,
`stacked-area-chart`) are the ones that had baked whites; the in-house charts
already use `currentColor`.

## Reduced motion

`prefersReducedMotion()` (one-shot) is correct **inside a draw effect** — it is
re-read on the next draw. Anywhere it would be sampled once and kept (a
`useState` initialiser, a render-time branch) use **`useReducedMotion()`**,
which subscribes to the media query: a chart that samples at mount never hears
the setting change. And gate the *animation*, never the *interaction* — the
bubble cloud's drag is attached under reduce too (the simulation stays stopped
and each pointer move advances it one tick).

## Fitting text a chart cannot see

A chart knows a dimension its caller does not, so it publishes it rather than
letting frames guess:

- **`measureTextWidth(text, font)`** (`lib/measure-text.ts`, exported) — canvas
  measurement for label gutters that must be sized before the text is in the
  DOM. `stacked-area-chart` derives its y-axis margin from it (a fixed 50px
  clipped `$40.00T`); `scatter-chart` nudges its end x-ticks inward by it.
- **`--zf-pie-hole` / `--zf-gauge-hole`** — the ring hole's measured diameter,
  set on `PieChart`'s and `RadialGauge`'s centre slot. Both slots span the whole
  box (they must, or the arc beneath is unhoverable), so a centre readout has no
  other way to know how much room the ring left it: `filings-mix` caps its block
  at `calc(var(--zf-pie-hole) * 0.9)`, and `GaugeCard.Value` shrinks its figure
  to fit. Deliberately advisory — the charts do NOT clip their own slot, because
  a hard clip would newly cut headline numbers that overhang by a few px today.
