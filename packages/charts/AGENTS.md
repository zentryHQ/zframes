# @zframes/charts

The D3 base chart layer. A zero-`@zframes`-dependency leaf: it must stay generic.

**Cardinal rule.** Base charts stay generic — no business logic, no data fetching; frames own data, charts own rendering.

## What ships

D3 base chart layer ported from zTerminal (`tree-chart`, `heatmap-chart`, `multi-series-line-chart`, `stacked-area-chart`, `pie-chart`, `mini-line-chart`) plus in-house additions (`bar-chart`, vertical/horizontal, diverging-aware; `scatter-chart`, x/y bubble, linear/log y; `radial-gauge`, bounded-scalar arc with a center slot; `histogram-chart`, a binned distribution with optional markers, shipping the stats kernel frames reuse (`binSample`/`chooseBinWidth`/`normalCurve`/`quantile`/`sampleStats`); `bubble-chart`, packed circles sized by magnitude; `calendar-heatmap`, a day-grid year view) and `theme.css` (zTerminal design tokens for Tailwind v4). `multi-series-line-chart` also takes an optional `events: ChartEvent[]` and overlays an `EventLayer` (dashed rule + top flag + hover/focus tooltip, neighbours within 18px clustered, out-of-window markers dropped) — generic annotations the caller supplies (in practice the card's own), not a data source. Implementation-agnostic: no business logic, no data fetching.

`loading-orb/` is internal (used by `multi-series-line-chart`), deliberately not
exported.
