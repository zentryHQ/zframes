# zframes

AI-personalizable market dashboard framework (working name — do NOT call it "hyperframes"; that's HeyGen's project, which we use as the distribution-model reference). An agent reads the frame catalogue (Zod → JSON Schema), emits a `dashboard.json` spec, and the runtime validates + renders it as a live dashboard.

## Commands

```bash
pnpm install
pnpm dev          # playground at http://localhost:5179 (project default port, strict)
pnpm typecheck    # tsc --noEmit via playground (covers workspace source packages)
pnpm build        # vite build
```

## Structure

- `packages/core` — `defineFrame`/`defineFrameMeta`, registry, `DashboardSpecSchema`, `DashboardRenderer` (CSS-grid; error cards for invalid config AND missing capabilities), capability-routed multi-provider hooks, `catalogueForAI`. The card/error/chrome rendering both renderers share lives in `frame-content.tsx` (`FrameContent` + `FRAME_CSS`). Spec extras: `featured` (hero frame, gets an accent rim) on instances, `background` (`BackgroundSchema`) on the dashboard; frame meta carries optional `chrome: "bare"` (renders chrome-less — headings become zone dividers) and optional `layout` (`{w,h,minW?,minH?,maxW?,maxH?}` — editor sizing only, ignored by the CSS-grid renderer). Deep exports (`@zframes/core/spec`, `/frame`, `/catalogue`) are React-free for tooling. Two opt-in subpaths back the editable dashboard: `@zframes/core/editor` (`DashboardEditor` — see Conventions) and `@zframes/core/vite` (`dashboardWriteback()` dev plugin).
- `packages/charts` — D3 base chart layer ported from zTerminal (`tree-chart`, `heatmap-chart`, `multi-series-line-chart`, `stacked-area-chart`, `pie-chart`, `mini-line-chart`) plus `theme.css` (zTerminal design tokens for Tailwind v4). Implementation-agnostic: no business logic, no data fetching.
- `packages/provider-hyperliquid` — free no-key provider: allMids WS (one subscription per HIP-3 dex, added lazily from requested symbols), day stats per dex (full universe when no symbols given), fundingHistory, candleSnapshot
- `packages/provider-defillama` — TVL per chain (`tvl` capability)
- `packages/provider-alternativeme` — fear & greed index (`sentiment` capability)
- `packages/provider-coingecko` — global marketcap + dominance (`global-market` capability, free tier no key)
- `packages/frames` — 12 frames: `price-chart` (liveline candle/line, the centerpiece), `price-ticker`, `top-movers`, `funding-rate-chart`, `funding-heatmap`, `tvl-treemap`, `fear-greed` (with zTerminal's striped mood bar), `bitcoin-dominance` (ported zTerminal segmented bar), `dino-game` (ported, CDN sprite swapped for drawn cactus), `note`, `image`, `heading`. **`src/schemas.ts` is the single source of truth for frame metadata** — pure Zod, no React, imported by both the components and the CLI. New frame = add meta to schemas.ts + component file + `allFrames`.
- `packages/cli` — `zframes catalogue | lint | init` (tsup-bundled bin; `pnpm build:cli`, then `pnpm zframes <cmd>` at root). `lint` is the generating agent's feedback loop.
- `skills/zframes/SKILL.md` — the agent skill: resolve CLI → scaffold/locate app → read catalogue → interview → emit dashboard.json → lint → run
- `apps/playground` — Vite demo that loads `src/dashboard.json`; Tailwind v4 via `@tailwindcss/vite` (`@source` directives scan workspace packages). Renders the spec through `DashboardEditor` (not the bare `DashboardRenderer`), so the dashboard is end-user-editable; `App.tsx`'s `onSave` PUTs the edited spec to the `dashboardWriteback()` dev plugin (`vite.config.ts`) and reloads, falling back to a download in a static build. Renders `spec.background` via `src/background.tsx` (Unicorn Studio scene through `unicornstudio-react`, lazy-loaded, behind a contrast scrim).
- `patches/liveline@0.0.7.patch` — vendored from zhive (DPR fix + label precision); applied via pnpm `patchedDependencies`

## Conventions

- pnpm only. Packages ship TypeScript source (`main: src/index.ts`); the playground's Vite consumes them directly (`optimizeDeps.exclude`).
- Every frame schema field needs `.describe()` — schemas are read by generating agents via `catalogueForAI`.
- `dashboard.json` is the AI-generated artifact. Invalid frame configs render as per-frame error cards (the agent's feedback loop), never crash the dashboard.
- Frame chrome (cards, titles, hover) lives in the renderer's injected `.zf-*` stylesheet, themeable via `--zf-*` CSS vars — frames style only their interior.
- Dashboard background: the **spec declares** it (`background: {type: "gradient"|"unicorn"|"none", projectId?, opacity?}`), the **host renders** it (playground's `background.tsx`) — same split as providers. Scene `opacity` is kept low (~0.05) so it's a faint backdrop, not a distraction; cards are opaque so content always wins. `unicornstudio-react` lives only in the playground, never in core. **Footgun:** a `unicorn` background loads the SDK from a jsDelivr CDN and the scene from a hosted Unicorn Studio project (`K42KSY4FXeXhjVOj9RgT` is the zframes default) — keyless, but an external runtime dependency (like the Google Fonts import); it falls back to the body gradient if the SDK fails. The skill emits `unicorn` by default.
- Original assets only — never copy art/code from other workspace projects (lens is personal; the 3z repos have closed history). Exception: zTerminal base charts are ported deliberately into `packages/charts` (Zentry's own IP, public-OSS decision pending owner sign-off before first public release).
- Base charts stay generic — no mindshare/news/zAI concepts; frames own data fetching and transformation, charts own rendering.
- **Editable dashboard** (`@zframes/core/editor` → `DashboardEditor`, GridStack, mirrors the nexus workspace "customise mode"): the agent generates `dashboard.json` AND a human edits the *same* file — drag/resize/add/delete + a per-frame config rail, then Save. Edits round-trip the human-readable `dashboard.json` (the host's `onSave`), never a localStorage blob — `@zframes/core/vite`'s `dashboardWriteback()` writes the file in dev, download as the static fallback. GridStack owns each item's DOM, so frames render into per-item React roots wrapped in `FramesProvider` (shared provider instances — no duplicate WS). New-frame default config = `schema.safeParse({})`; required-field frames land as error cards until the rail fills them. **Footgun:** `vite.config.ts` + `package.json` (gridstack dep) are template-owned — edit them in BOTH `apps/playground/` and `packages/cli/templates/app/`; only `src/{App,main,background}.tsx` + `index.html` + `styles.css` + `packages/*` auto-sync via `sync-template.mjs`.

## Scope decisions (2026-06-12)

- **Public open-source** is the target distribution; everything must run keyless (Hyperliquid, DeFiLlama, alternative.me, CoinGecko free).
- **No zAI/zData data for end users** (too expensive) — zAI-semantic widgets (mindshare, creators, sectors) are out of scope.
- **No TradingView** (license) — `liveline` (npm, benjitaylor/liveline; already used in zhive with pnpm patches) is the live price-chart engine.
- **Stocks first**: equity perps via Hyperliquid HIP-3 builder dexes (`dex` param), same free WS.

## Done (2026-06-12)

- ~~liveline price-chart + HIP-3 stocks~~ — `price-chart` frame streams `xyz:TSLA` candles live
- ~~Widget wave~~ — top-movers, fear-greed, tvl-treemap, note shipped
- ~~CLI~~ — `catalogue` / `lint` / `init` built and smoke-tested
- ~~/zframes skill~~ — `skills/zframes/SKILL.md`
- ~~Multi-provider + namespaced symbols~~ — capability routing in core; HL's own `dex:SYMBOL` namespacing covers stocks

## Done (2026-06-17)

- ~~Editable dashboard~~ — `DashboardEditor` (GridStack, nexus-style customise mode) + `dashboardWriteback()` dev plugin; in-browser drag/resize/add/delete/config round-trips `dashboard.json`. See Conventions.

## Roadmap (next)

1. Standalone app scaffold: `zframes init` should scaffold a full Vite app (not just dashboard.json) so non-repo users get a one-command start
2. Skill distribution: publish packages + skill so `npx skills add zframes` works outside this repo
3. More frames: heatmap-based (funding/volume heatmaps), stacked-area marketcap distribution, fun widgets (dino game), orderbook depth via liveline's `orderbook` prop
4. `zframes preview` — serve the playground pointed at any dashboard.json path
