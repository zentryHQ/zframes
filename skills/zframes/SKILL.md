---
name: zframes
description: Build or update the user's personal zframes market dashboard. Use when the user says "/zframes", "build me a dashboard", "set up my terminal", "make me a market terminal", "add X to my dashboard", or wants a personalized live market dashboard (crypto + stocks). Scaffolds a runnable app with the CLI, then emits a validated dashboard.json — the agent never writes React.
---

# zframes — your dashboard, generated

You set up the user's dashboard by driving the **zframes CLI** and writing a
`dashboard.json` spec. The framework owns all React; you only ever write JSON.
Never create or edit `.tsx` files for this task.

## 0. Resolve the CLI

You'll call the zframes CLI repeatedly (`init`, `catalogue`, `lint`). Resolve
how to invoke it once, and use that everywhere below as `zframes`:

- **Inside the zframes monorepo (the path that works today)** → `pnpm zframes <cmd>`
  (run `pnpm build:cli` once if `packages/cli/dist/` is missing).
- **Standalone, once published** → `npx zframes@latest <cmd>`. npx fetches the
  published CLI per run; no global install to manage.

> Note: the CLI isn't on npm yet (deployment plan, Phase 2), so `npx zframes`
> won't resolve until then — use the monorepo `pnpm zframes` path today. The
> steps are identical either way.

## 1. Locate or scaffold the app

**Is there already a zframes app?** A directory with `src/dashboard.json`, or a
`package.json` that depends on `@zframes/*` (inside the monorepo that's
`apps/playground/`). If the user is in one or names one, that's your target —
read its existing `dashboard.json` and skip to step 2 to update it.

**Otherwise scaffold a fresh one** — this is the new-user path:

```bash
zframes init my-terminal      # full runnable app; refuses a non-empty dir
cd my-terminal && pnpm install
```

The app's spec is now `my-terminal/src/dashboard.json` — that's the file you
write in step 4. The scaffold is the user's own app: git-trackable, hackable,
no service to operate.

## 2. Read the catalogue — always, before generating

```bash
zframes catalogue
# in the monorepo: pnpm --silent zframes catalogue   (--silent keeps pnpm's
#                                                      banner out of the JSON)
```

This prints every available frame with its description, capabilities, and
config JSON Schema. Frame names, config fields, and enum values come from
here — never from memory. The catalogue grows; your memory doesn't.

## 3. Interview the user (first run = onboarding)

Keep onboarding **short** and ask only about what the user cares about — never
about frames, widgets, or "extras". A first-time user shouldn't have to know
what a "widget" is, read back a catalogue of frame names, or assemble the
dashboard themselves. You map their answers onto catalogue frames, and you
supply the rest (zones, section labels, a sensible default context set, the
background) from the good-dashboard defaults in step 4 — don't ask about those.

Ask, in the user's language, essentially two things:

1. **What do you want to keep an eye on?** The assets — stocks ("TSLA", "NVDA",
   "AAPL") and/or crypto ("BTC", "ETH", "HYPE"). Ask and show **plain tickers
   only**; the `xyz:` HIP-3 dex prefix is a framework internal — never surface it
   in a question or option. When the user names a stock, *you* add the `xyz:`
   prefix silently when writing the spec (so "TSLA" → `xyz:TSLA`); crypto stays
   bare. zframes leads with stocks. Also note which 1–2 are the **main focus**
   (the big live chart) and roughly the timeframe (intraday vs swing). This is
   the core — everything else follows from it.
2. **What else matters to you?** *(optional — skip if they've already implied
   it, or just pick sensible defaults.)* Phrase these as interests/outcomes, not
   frame names — then translate to frames yourself. The user picks the interest;
   you pick the widget. Map e.g.:
   - "the overall market mood / is it greedy or fearful" → `fear-greed`, `bitcoin-dominance`
   - "what's moving today / biggest movers" → `top-movers`
   - "where money's flowing on-chain / which chains" → `tvl-treemap`
   - "funding / leverage / who's paying to be long" → `funding-rate-chart`, `funding-heatmap`
   - "a glanceable watchlist of my assets" → `price-ticker`

Everything else is your call, not a question: add zone `heading`s, feature the
centerpiece, and include a tasteful default context set. Add a trading-plan
`note`, a logo `image`, or the `dino-game` only if the user brings it up — don't
prompt for them. The user can always refine later with "add X to my dashboard".

If you render this as a picker (e.g. AskUserQuestion), label steps and options
by interest ("Market mood", "What's moving", "On-chain flows"), never by frame
name ("fear-greed", "tvl-treemap").

For "update my dashboard" requests, read the existing `dashboard.json` first
and change only what they asked for.

## 4. Emit the spec

Write the app's `src/dashboard.json`. Layout rules:

- 12-column grid, `rowHeight: 96`, `gap: 12`.
- **Group into zones.** Put a `heading` frame (full-width `w: 12, h: 1`) above
  each group of related frames — e.g. "Markets", "On-chain", "Desk". Headings
  render as bare section dividers (no card); they're what make a dashboard read
  as designed instead of a widget dump. A good dashboard has 2–3 zones.
- **Feature the centerpiece.** Set `"featured": true` on the single hero frame
  (usually the main `price-chart`) — the renderer gives it an accent rim.
  Exactly one featured frame per dashboard.
- **Title each card.** Set a per-instance `"title"` (sibling of `frame`/`position`)
  to label the card; it overrides the default, which is just the frame-type name.
  Required on every `price-chart` — use the ticker (`"title": "TSLA"`, not
  `"PRICE CHART"`) so a wall of charts is readable. Useful on any frame whose
  type name is ambiguous; skip it for `heading` (bare, no card chrome).
- Big charts: `w: 6–12, h: 3`. Lists/tickers: `w: 3–4, h: 3`. Small cards
  (fear-greed, bitcoin-dominance): `w: 2–3, h: 3`.
- No overlaps; no frame past column 12; every `id` unique and human-readable.
- Only set config fields the user cares about — schema defaults cover the
  rest, except required fields (the catalogue's `required` list).
- **Background.** Include `"background": { "type": "unicorn", "projectId": "K42KSY4FXeXhjVOj9RgT", "opacity": 0.05 }`
  at the top level (next to `grid`). Keep `opacity` low (~0.05) — the scene is a
  faint backdrop, never a distraction. To opt out, use `"type": "gradient"`
  (built-in dark glow, fully keyless) or `"none"`.

## 5. Lint — the feedback loop

```bash
zframes lint <app>/src/dashboard.json
```

If it reports issues, fix the JSON and re-lint until clean. The error
messages name the frame instance and the exact field. Unknown frame names
come back with the list of valid ones — use it.

Renderer-level failures (a frame whose capability no provider covers) show
up as error cards in the running app; treat those the same way.

## 6. Hand off

Start (or reload) the app and open it for the user:

```bash
cd <app> && pnpm dev      # http://localhost:5179
```

The dashboard hot-reloads whenever `dashboard.json` changes, so further edits
are instant — no restart.

## Hard rules

- dashboard.json is the only artifact. No React, no CSS, no new frames.
  If the user wants a frame that doesn't exist, say so and list what does.
- Free data only: Hyperliquid (crypto + HIP-3 stock perps), DeFiLlama,
  alternative.me, CoinGecko. There are no API keys to configure — never ask for one.
- Re-read the catalogue every session; never trust remembered frame names.
