# Light / Auto Mode — implementation design (deferred)

> Captured 2026-06-25 from a design scout, so the deferred light-mode session starts warm.
> Status: **not implemented.** User deferred light mode to its own focused session (it's the one big multi-file item). Build semantic colors + phase-3 cheap wins first.

## Approach

Add `theme.mode: "dark" | "light" | "auto"`. `"dark"` = the exact current look (strict no-op). Mode is a **`data-zf-mode` attribute** on the containers that already carry the inline `--zf-*` vars (`.zf-grid`, `.zf-editor`), **plus a `:root` mirror the host pushes** (like `--zf-accent-hue`), because the chart `--color-*` tokens are `@theme`-emitted at `:root`.

Light values live in **two declaration sites** (the same var()-resolves-where-declared split that forced the `--font-dmsans` container bridge):

| Surface | var() resolves at | Light override goes in |
|---|---|---|
| FRAME_CSS card chrome (`--zf-frame-bg`, border, title/text, sheen, shadows, error) — reads inline `--zf-base-*` | `.zf-grid` / `.zf-editor` | `FRAME_CSS`, as `.zf-grid[data-zf-mode="light"]`, `.zf-editor[data-zf-mode="light"]` |
| Chart `@theme` tokens (`--color-*`) — flips ~246 `text-soft`/`fill-*` usages at once | `:root` | `charts/theme.css`, as `:root[data-zf-mode="light"]` |
| `--color-highlight` / `--color-accent-line` (accent) | `:root` | no change (accent is mode-agnostic) |

`auto` = author each override twice: the unconditional `[data-zf-mode="light"]` block + a `@media (prefers-color-scheme: light){ [data-zf-mode="auto"] }` copy. `dark` matches nothing → baked defaults stand.

**Set the attribute:** `renderer.tsx` on `.zf-grid`, `editor.tsx` on `.zf-editor` (+ `mode` state mirroring accent, `onModeChange` callback), `App.tsx` pushes `document.documentElement.setAttribute("data-zf-mode", mode)` in an effect + `liveMode` state. `styles.css` `body` needs a `:root[data-zf-mode="light"] body` override (it's not in FRAME_CSS/theme.css).

## Token map (dark stays exact; light = flip lightness, keep hue/sat/alpha)

**FRAME_CSS card chrome** — card gradient stops L 12.5/7/5.3% → **99/97/95.5%** (keep `--zf-base-hue/sat` vars; consider `calc(--zf-base-sat * 1.5)` since HSL sat reads fainter near white); border `hsl(accentH accentS 76%/α)` → `42%/(α+0.12 floor)`; sheen `rgba(255,255,255,.16)` → `rgba(0,0,0,.10)` (move behind a `--zf-sheen` var); shadows: inset highlight → near-white, drop shadows → `rgba(15,23,42,.06–.18)`; title `rgba(255,255,255,.5)` → `rgba(15,23,42,.55)`; source link similar; error icon `#ff8b9d` → `#c0143b`, error text whites → `rgba(15,23,42,…)`. **Three bare literals need var-wrapping first:** `.zf-frame-source-sep` (~L175), `.zf-error-issue` bg (~L293), `.zf-error-list` (~L317).

**charts/theme.css `@theme` tokens** — `--color-background` `222 22% 8%`→`98%`; `-terminal` `240 24% 7%`→`96%`; `--color-surface` white-alpha → dark-alpha base `222 30% 12%`; `--color-normal/strong/soft/disabled` whites → `222 40–45% 9–11%` / `222 30% 20%` / `222 20% 35%` (bump disabled alpha); `--color-card/-hover` whites → dark-alpha; `--color-highlight` 89%L → optionally 55%L (bright accent text unreadable on white); `--color-accent-line` 72%L — leave.

**baseHue/baseSat:** light surface stops use the same inline vars with high baked L, so the tint knob keeps working. Chart `--color-*` stay fixed-neutral (`:root` can't see the container's `--zf-base-hue` — don't wire them to it).

## Risk list — ~50 hardcoded literals the token flip WON'T reach (need per-spot refactor; this is the parallelizable tail)

These are disjoint files → ideal for parallel fan-out once tokens exist.

- **charts/** (highest leverage, shared): axis/grid constants `#FFFFFF` in `multi-series-line-chart/constants.ts:34,44`, `stacked-area-chart/constants.ts:16,24`; D3 hover `white` strokes/fills in `multi-series-line-chart/create-interactions.ts:47,106,112,113`, `stacked-area-chart/index.tsx:333`; tooltips `bg-slate-700`/`bg-zinc-900`/`text-white` in `chart-tooltip.tsx`, `stacked-area-chart/index.tsx:358–390`, `tree-chart/tooltips-container.tsx:17`; legend/series buttons `text-white` in `series-group-button.tsx`, `chart-legend.tsx:87`; white-overlay glows in `pie-chart.tsx`, `heatmap-chart/index.tsx:248,287,308`, `tree-chart/index.tsx:359`. (`pie-chart.tsx:163,174` `#fff` maskImage is an alpha mask — leave.)
- **frames/ canvas games (all art is literal):** `game-ui.ts:28,29` HUD ink, `flappy-bird.tsx:29,30,32`, `snake.tsx:24`, `dino-game.tsx:22–25`. Fix via the existing computed-style read (games already read `--zf-accent-*`).
- **frames/ portfolio form:** `portfolio-common.tsx:212,214,102,262` (`border-white/10 bg-white/[0.04] text-white/90`).
- **frames/ market-hours:** many `rgba(255,255,255,*)`/`rgba(0,0,0,*)`/`border-white/*` (`market-hours.tsx:49,52,157–274`).
- **frames/ the `white`-alpha tile idiom** (refactor to a `--color-border`/`bg-card` token → flips for free): `divider.tsx:8`, `heading.tsx:33`, `content-shared.ts:9`, `day-meter.tsx`, `checklist.tsx`, `feed-row`, `filings-feed`, `financial-stress`, `fundamentals`, `lightning-stats`, `link-grid`, `metric-row`, `national-debt`, `news-feed`, `open-interest`, `portfolio-holdings`, `portfolio-value`, `price-liveline:196,216`, `rates-board`, `risk-reward`, `short-volume`, `btc-blocks`, `btc-difficulty`, `calculator`, `yield-curve`, `ui.tsx` (scrollbar + skeletons). `asset-logo.tsx:108 bg-white` — verify (may be intentional for logo contrast).
- **app chrome:** `styles.css:28,30,42,43` (body bg/color, scrollbar), `App.tsx:266,281` (`border-white/[0.06/0.08]`).

**Highest-leverage single move:** route the `border-white/[0.08]` + `bg-white/[0.04]` idiom through a token (e.g. `--color-border`) so §token-flip covers all ~30 call sites at once; only literal-rgba spots (games, market-hours, charts D3) need per-spot JS/CSS handling.
