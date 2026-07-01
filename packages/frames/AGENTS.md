# @zframes/frames

The frame components. Each frame = a Zod meta (in `schemas.ts`) + a component (its own `.tsx`) + an entry in `allFrames` (`index.ts`). Schemas are read by generating agents; components render data through **shared primitives**.

## Cardinal rule: don't hand-roll — route through the shared primitive

These frames are meant to read as **one system**, not a pile of one-offs. Every recurring concern — number formatting, gain/loss color, type scale, loading/empty, scroll, list rows — already has exactly one home. Before you write a compact-`$` formatter, a `#hex`, a `text-[…]`, or a custom spinner, **import the primitive instead**. New divergence is the regression this package was harmonized to remove (see `docs/frame-ui-harmonization.html`).

| Concern | Use | Never |
|---|---|---|
| Compact magnitude | `formatCompact` / `formatCompactUsd` (`./format`) — `$1.23B`, `340.00M` | a rolled-own `/1e9 + "B"` |
| Exact price | `formatPrice` | `toLocaleString` inline |
| Signed delta % | `formatChangePct` (`+1.23%`) | `toFixed` + manual sign |
| Level / ratio % | `formatPct` · funding → `formatFundingPct` | — |
| BTC / sats · hashrate · slug · "time since" | `formatBtc` · `formatHashrate` · `prettySlug` · `timeAgo` | — |
| Gain/loss tint | `changeColor` / `UP_COLOR` / `DOWN_COLOR` (`./format`) — **semantic, must NOT rotate with the accent** | raw `#3fd08f` / `#ff6b81` |
| Headline numeral | `metric-sm/md/lg/xl` utilities | `text-2xl/3xl/4xl` scatter |
| Body / caption / card title | `body-sm/md/lg` · `caption` · `heading-card-title` | `text-[0.6875rem]` etc. |
| Text color | `text-strong / text-normal / text-soft / text-disabled / text-highlight` | `text-white`, raw `/opacity` |
| Loading & empty | `FrameStatus` (`loading` prop → skeleton; children → quiet empty) (`./ui`) | a bespoke spinner / "no data" div |
| Vertical / horizontal scroll | `scrollAreaClass` / `scrollAreaXClass` (`./ui`) | raw `overflow-y-auto` + scrollbar CSS |
| Asset row (logo·ticker·price·Δ) | `MoverRow` (`./mover-row`) | a new row layout |
| Treemap tile label | `TreemapLeaf` (`./treemap-leaf`) | per-treemap label code |
| Link-feed row | `FeedRow` (`./feed-row`) — leading · title · subtitle · `timeAgo` meta | a new feed row |
| Name→value row | `MetricRow` (`./metric-row`) | a new macro-list row |
| Fee tile + tint | `FeePill` / `feeRateColor` (`./btc-shared`) | — |
| Accent-reactive control surface | `interactiveSurface` (`./content-shared`) | a fixed-grey bordered tile |
| Canvas-game HUD / accent | `accentColor` · `GAME_HUD` · `drawScore` (`./game-ui`) | a baked-in indigo / per-game HUD |
| Asset logo / ticker | `AssetLogo` · `assetLogoUrl` · `tickerOf` (`./asset-logo`) | — |

Read the JSDoc on the primitive before using it — each says exactly when to reach for it vs. a sibling.

## Deliberate exceptions — leave these alone

These intentionally don't go through the generic primitives; don't "harmonize" them away: **fear-greed mood ramp**, **treemap palette**, **BTC orange**, **holiday amber** (`market-hours`), and the **clock/countdown** `clamp()` type (their own container-query scale, not `metric-*`).

## Adding a frame

Per-frame metadata lives in **four** lists that must stay in lockstep — `registry-parity.test.ts` fails the build if they drift, and a missing loader/meta makes the frame vanish at runtime as an "Unknown frame" card:

1. `schemas.ts` — add the meta via `defineFrameMeta`. **Set `label`** (required — the human display name; it's the card's default title when an instance sets no `title`, plus the editor-palette / catalogue name. Use Title Case with real acronyms, e.g. `"OI by Strike"`, `"BTC Fees"` — not the raw `frame-id`). **Set `category`** (one of `FRAME_CATEGORIES`' keys in `@zframes/core` — required; groups the editor palette and the AI catalogue) and give **every field a `.describe()`** (read by `catalogueForAI`). React-free — no component imports. Then add the meta to **`allFrameMetas`** (every renderable frame; the runtime registry's source), and — only if the generating agent should be able to pick it — also to **`frameMetas`** (the curated AI catalogue; games/journal/tools/layout frames are deliberately omitted).
2. New `<frame>.tsx` — import the meta, build the component using the primitives above, `export const xFrame = defineFrame({ ...xMeta, component: X })`.
3. `index.ts` — add `xFrame` to `allFrames` (for hosts that register eagerly). **And `lazy.ts`** — add `"<name>": { load: () => import("./<name>").then((m) => m.xFrame) }` (set `titleIcon: true` if the module exports one). This is the per-frame chunk the runtime lazy-loads; **a missing entry = the frame silently won't render.**
4. `pnpm typecheck && pnpm lint && pnpm test` from the repo root before committing — the parity test confirms `allFrameMetas` ≡ `lazy.ts` loaders.

## Footguns

- `schemas.ts` is the single source of truth for frame metadata **and must stay React-free** — the CLI, catalogue export, and the `/zframes` skill import it without charts/liveline/CSS.
- Frame **chrome** (card, title, hover, source link) is the renderer's job (`@zframes/core` `FrameContent` + injected `.zf-*` CSS). A frame styles only its **interior**.
- Keyless only, stocks-first — see the repo root `../../AGENTS.md` for project-wide scope and commands.
