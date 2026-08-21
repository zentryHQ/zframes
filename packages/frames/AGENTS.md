# @zframes/frames

The frame components. Each frame = a Zod meta (in `schemas/<family>.ts`) + a component (its own `.tsx`) + an entry in `allFrames` (`index.ts`). Schemas are read by generating agents; components render data through **shared primitives**.

## Cardinal rule: don't hand-roll — route through the shared primitive

These frames are meant to read as **one system**, not a pile of one-offs. Every recurring concern — number formatting, gain/loss color, type scale, loading/empty, scroll, list rows — already has exactly one home. Before you write a compact-`$` formatter, a `#hex`, a `text-[…]`, or a custom spinner, **import the primitive instead**. New divergence is the regression this package was harmonized to remove.

| Concern | Use | Never |
|---|---|---|
| Compact magnitude of a NON-money quantity | `formatCompact` (`./format`) — contracts, ounces, tx counts, share volume, bytes | using it for money (see the row below) |
| Market money (price / aggregate) | **`useMoney()`** (`@zframes/core`) — `money.price(usd)`, `money.compact(usd)`; takes USD in, renders the card's display currency | `formatPrice`/`formatCompactUsd` on market data (they hard-code `$`) |
| Money on an axis / bar label (no symbol) | **`money.magnitude(usd)`** — converted but unitless, e.g. an options strike axis | bare `formatCompact` on a money value — it converts nothing, so a THB board prints USD strikes next to a baht spot |
| Exact price — US-macro / explicitly-USD only | `formatPrice` | `toLocaleString` inline |
| Unit-less INDEX level (equity index, base-year-100 HPI) | `formatLevel` (`./format`) — grouped thousands, always 2dp, no symbol | `formatPrice` (an index has no currency) |
| Signed delta % | `formatChangePct` (`+1.23%`) | `toFixed` + manual sign |
| Level / ratio % | `formatPct` · funding → `formatFundingPct` | — |
| BTC / sats · hashrate · slug · "time since" | `formatBtc` · `formatHashrate` · `prettySlug` · `timeAgo` | — |
| Gain/loss tint | `changeColor` / `UP_COLOR` / `DOWN_COLOR` (`./format`) — **semantic, must NOT rotate with the accent** | raw `#3fd08f` / `#ff6b81` |
| Headline numeral | `metric-sm/md/lg/xl` utilities | `text-2xl/3xl/4xl` scatter |
| Body / caption / card title | `body-sm/md/lg` · `caption` · `heading-card-title` | `text-[0.6875rem]` etc. |
| Text color | `text-strong / text-normal / text-soft / text-disabled / text-highlight` | `text-white`, raw `/opacity` |
| Loading & empty | `FrameStatus` (`loading` prop → skeleton; children → quiet empty) (`./ui`) | a bespoke spinner / "no data" div |
| Matrix cell figure (heatmap `CellComponent`) | `cellLabelFits(width, height, minWidth)` (`./ui`) — drops the label when the cell can't hold it | a hand-rolled `if (width < 44) return null` — width-only, so it clips on a dense grid |
| Vertical / horizontal scroll | `scrollAreaClass` / `scrollAreaXClass` (`./ui`) | raw `overflow-y-auto` + scrollbar CSS |
| Asset row (logo·ticker·price·Δ) | `MoverRow` (`./mover-row`) — pass `price` in **USD**; the row converts via `useMoney()` itself | a new row layout, or a per-caller price formatter |
| Treemap tile label | `TreemapLeaf` (`./treemap-leaf`) | per-treemap label code |
| Link-feed row | `FeedRow` (`./feed-row`) — leading · title · subtitle · `timeAgo` meta | a new feed row |
| Name→value row | `MetricRow` (`./metric-row`) | a new macro-list row |
| Fee tile + tint | `FeePill` / `feeRateColor` (`./btc-shared`) | — |
| Accent-reactive control surface | `interactiveSurface` (`./content-shared`) | a fixed-grey bordered tile |
| Canvas-game HUD / accent | `accentColor` · `GAME_HUD` · `drawScore` (`./game-ui`) | a baked-in indigo / per-game HUD |
| Asset logo / ticker | `AssetLogo` · `assetLogoUrl` · `tickerOf` (`./asset-logo`) | — |
| Time-series line chart | **`TimeSeriesChart`** (`./series-chart`) — `MultiSeriesLineChart` plus the card's event markers (+ `annotatable: true` on the meta) | importing `MultiSeriesLineChart` from `@zframes/charts` (silently drops the card's event flags) |
| Official published series (FRED/FHFA index levels, spreads, rates) | `./official-series-shared` — `SeriesHeader` (label · date · value · move) + `formatSeriesValue`/`formatSeriesChange` (percent for a level, **basis points** for a rate/spread) | a per-frame header + a per-frame idea of what a spread move means |
| Metals series maths + units | `./metals-shared` — windowing (`sliceYears`/`downsample`/`timeframeFor`), returns (`annualReturns`/`monthlyReturns`/`simpleReturns`/`cagrPct`), `drawdownSeries`/`allTimeHigh`, `rollingVolatility`, `percentileRank`/`correlation`, `alignSeries`/`ratioSeries`/`onSharedFixDays`/`rebaseToPct`, `pricePerUnit`/`toTroyOunces`, `formatFixPrice` | a per-frame definition of "annual return" |

Read the JSDoc on the primitive before using it — each says exactly when to reach for it vs. a sibling.

`./metals-shared`'s **windowing/thinning/rebasing** helpers (`sliceYears`, `downsample`, `toChartData`, `timeframeFor`, `rebaseToPct`, `pctChange`) are generic `SeriesPoint[]` maths that merely live in that module for historical reasons — the FRED/Zillow/FHFA frames import them directly rather than re-deriving them. Its *metals-specific* helpers (fix days, troy ounces, `formatFixPrice`) are not for general use.

## Deliberate exceptions — leave these alone

These intentionally don't go through the generic primitives; don't "harmonize" them away: **fear-greed mood ramp**, **treemap palette**, **BTC orange**, **holiday amber** (`market-hours`), and the **clock/countdown** `clamp()` type (their own container-query scale, not `metric-*`).

## Adding a frame

Per-frame metadata lives in **four** lists that must stay in lockstep — `registry-parity.test.ts` fails the build if they drift, and a missing loader/meta makes the frame vanish at runtime as an "Unknown frame" card:

1. `schemas/<family>.ts` — add the meta via `defineFrameMeta`, in the file for its `category` (one per `FRAME_CATEGORIES` family, 14 of them; `crypto.ts` is the largest, `shared.ts` holds the common field helpers). The thin `schemas.ts` barrel re-exports them all, so nothing else needs touching. **Set `label`** (required — the human display name; it's the card's default title when an instance sets no `title`, plus the editor-palette / catalogue name. Use Title Case with real acronyms, e.g. `"OI by Strike"`, `"BTC Fees"` — not the raw `frame-id`). **Set `category`** (one of `FRAME_CATEGORIES`' keys in `@zframes/core` — required; groups the editor palette and the AI catalogue) and give **every field a `.describe()`** (read by `catalogueForAI`). React-free — no component imports. Then add the meta to **`allFrameMetas`** (every renderable frame; the runtime registry's source), and — only if the generating agent should be able to pick it — also to **`frameMetas`** (the curated AI catalogue; games/journal/tools/layout frames are deliberately omitted).
   **Set `layout` — all four bounds.** `{ w, h, minW, minH, maxW?, maxH? }`: the span the frame is added at, and the floor and ceiling the editor's resize handles enforce. Guess it to start, then **measure it**:

   ```bash
   pnpm --filter @zframes/storybook build
   PROBE_FRAMES=<your-frame> pnpm frames:size:probe   # 96 spans, clipping/legibility/ink
   pnpm frames:meta
   SHEET_FRAMES=<your-frame> pnpm frames:size:sheet   # the envelope's corners, as a PNG to look at
   ```

   Omit `maxW`/`maxH` when the frame genuinely scales — that means unbounded, and is not the same as `12`. `tests/frame-layout-bounds.test.ts` fails the build if a frame ships without a floor or with an incoherent envelope.

   Then check both Storybook stories: **AllSizes** must look right at every span, and **OutOfBounds** — one step under each floor, one step over each ceiling — must fail *gracefully*. A cell there that looks perfectly fine means the bound is too strict; a cell that slices content in half means the frame, not the bound, still needs work.
2. New `<frame>.tsx` — import the meta, build the component using the primitives above, `export const xFrame = defineFrame({ ...xMeta, component: X })`.
3. `index.ts` — add `xFrame` to `allFrames` (for hosts that register eagerly). **And `lazy.ts`** — add `"<name>": { load: () => import("./<name>").then((m) => m.xFrame) }` (set `titleIcon: true` if the module exports one). This is the per-frame chunk the runtime lazy-loads; **a missing entry = the frame silently won't render.**
4. `pnpm typecheck && pnpm lint && pnpm test` from the repo root before committing — the parity test confirms `allFrameMetas` ≡ `lazy.ts` loaders.

## Footguns

- **A matrix cell's figure is gated on width AND height.** Route it through `cellLabelFits` (`./ui`); `tests/heatmap-label-fit.test.ts` fails the build if a frame importing `HeatmapChart` doesn't. A heatmap packs rows far tighter than columns — 20 years of monthly returns leaves ~11px a row — so a width-only guard prints every figure clipped top and bottom, and nothing errors: the renderer has no idea what the cell was meant to say. Axis labels are the chart's job and thin themselves on both axes (`packages/charts/src/heatmap-chart`); a **frame-owned** strip aligned under the grid (e.g. `metal-seasonality`'s per-month averages) must measure its own column width and shorten or hide its figures — a row of `+…` is noise, not data.
- **A wrong `layout` bound fails nothing.** The CSS-grid renderer ignores `layout` entirely — it is the editor's resize envelope and the generating agent's sizing hint. So a floor set too low renders happily with the chart squeezed under its axis, and a missing ceiling renders one number in an acre of empty card. Both read as design mistakes, never as errors, which is why the bounds are measured (`.github/scripts/frame-size-probe.ts`) rather than eyeballed.
- **A shared primitive that renders money resolves the currency ITSELF.** Never give one an optional formatter prop defaulting to a USD helper: `MoverRow` did, two of its three consumers passed nothing, and those cards quoted dollars on a baht board where the `$` lived in the primitive's default — invisible to the source grep built to catch exactly that. `tests/currency-coverage.test.ts` pins it.
- **A frame whose figures aren't convertible market money declares `usdOnly: true` on its meta** — US-macro series, SEC figures as filed, user-typed numbers. That flag is the single source of truth for the carve-out: `tests/currency-coverage.test.ts` derives its exemptions from it (a frame using `formatPrice` without it fails the build, and a flag on a frame that converts fails too), the editor greys out the card's Display-currency control and says why, and `catalogueForAI` surfaces it so the generating agent doesn't set a per-card `currency` that would be inert.
- **Money on market data goes through `useMoney()`, not `formatPrice`.** A card can be denominated in any of the 146 `CURRENCY_CODES` (dashboard `currency.code`, or a per-card override), and `tests/currency-coverage.test.ts` **fails the build** if a frame touches `formatPrice`/`formatCompactUsd` without declaring `usdOnly` (above). The plain `$` helpers are only for US-macro series, SEC figures as reported, and user-typed numbers. The hook is only callable from a component: for a nested React component (treemap `Leaf`, heatmap `Cell`) call `useMoney()` inside it — before any early return; for a D3 render callback that is NOT a component (`formatTitle`, `formatValue`), call the hook in the frame and let the closure capture `money` (see `market-bubbles`), or pass it down as a prop (see `order-book-depth`).
- **A time-series chart renders through `TimeSeriesChart` AND sets `annotatable: true` on its meta.** A card's `events` (its own dated markers) reach the chart only through that wrapper, and the meta flag is what makes the editor offer the Events panel + tells the AI catalogue the frame accepts markers. `tests/chart-events-coverage.test.ts` **fails the build** if either drifts — a chart that quietly opted out looks identical to a card nobody annotated, so nobody would catch it in review.
- **A frame that can source from two exchanges needs `source` plumbed all the way through.** Add `source: sourceField()` to its schema AND pass `config.source` into the hook — capability routing is first-match, so without it the frame silently keeps reading the default provider. Remember symbols are source-native (`xyz:TSLA` exists only on Hyperliquid; Bitkub lists bare tickers) and `quote-stream` is Hyperliquid-only.
- `src/schemas/` is the single source of truth for frame metadata **and must stay React-free** — the CLI, catalogue export, and the `/zframes` skill import it without charts/liveline/CSS.
- Frame **chrome** (card, title, hover, source link) is the renderer's job (`@zframes/core` `FrameContent` + injected `.zf-*` CSS). A frame styles only its **interior**.
- The package also re-exports `AssetLogo`/`assetLogoUrl`/`tickerOf` (keyless CDN logos + HIP-3 prefix stripping) for hosts.
- Keyless only, stocks-first — see the repo root `../../AGENTS.md` for project-wide scope and commands.

## Where the size bounds come from

The envelope is **measured, not guessed**, and it is surfaced in three places a wrong value shows up: `catalogueForAI` (so the generating agent sizes cards correctly), each explorer catalogue card, and `zframes lint` (which reports a board card sitting outside it). `tests/frame-layout-bounds.test.ts` pins `1 ≤ min ≤ default ≤ max` plus "no shipped board sits outside its frames' bounds".

The numbers come from `.github/scripts/frame-size-probe.ts`, which mounts each frame once and resizes it through all 96 spans (rewriting `--zf-col-span`/`--zf-row-span`), recording clipped content, labels hitting their ellipsis, chart boxes below legibility, visible list rows, and the "ink" fraction of the card that actually paints. `derive-frame-bounds.ts` turns that matrix into bounds and `frame-size-sheet.ts` renders the envelope's corners as a contact sheet to check by eye.

## Two things you do NOT have to touch

- **No Storybook edit needed.** A Default/AllVariants/AllSizes/OutOfBounds/States/Live story set auto-generates per frame (see `apps/storybook/AGENTS.md`).
- **No hand-kept frame list anywhere.** For the live, grouped list of which family holds which frames, read it from the source: the editor palette or `catalogueForAI` (`@zframes/core`), both driven off `FRAME_CATEGORIES` + the registry.
