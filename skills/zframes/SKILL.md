---
name: zframes
description: Build or update the user's personal zframes market dashboard. Use when the user says "/zframes", "build me a dashboard", "set up my terminal", "make me a market terminal", "add X to my dashboard", or wants a personalized live market dashboard (crypto + stocks). Writes a validated dashboard.json and serves it live with the CLI — the agent never writes React.
---

# zframes — your dashboard, generated

You set up the user's dashboard by driving the **zframes CLI** and writing a
`dashboard.json` spec. The CLI *is* the runtime: it serves a prebuilt dashboard
app pointed at that one file, editable in the browser. You only ever write JSON.
Never create or edit `.tsx` files for this task.

## 0. The CLI

The runtime ships as the `zframes` CLI on npm. Always invoke it with
**`npx zframes@latest <cmd>`** — npx fetches the published CLI (which bundles the
dashboard runtime) per run, so there's nothing to clone, install, or keep
current. The commands you'll use below are `catalogue`, `lint`, and `serve`
(written `zframes <cmd>` for brevity — always run them through `npx`).

## 1. Pick where the dashboard lives

The only artifact is a single `dashboard.json`. There is **no app to scaffold** —
the runtime comes from the CLI.

- **Updating an existing dashboard?** Find the `dashboard.json` the user is
  serving (or one in the current directory), read it first, and go to step 2 to
  change only what they asked for.
- **New dashboard?** Pick a directory for it — the current directory, or a fresh
  one the user names (e.g. `~/zframes`). The spec is `<dir>/dashboard.json`; that
  single file is everything the user owns. Any sibling files the spec references
  (a `daily-analysis.json` brief, a local image) live next to it in `<dir>`.

## 2. Read the catalogue — always, before generating

```bash
npx zframes@latest catalogue
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

Write `<dir>/dashboard.json`. Layout rules:

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
zframes lint <dir>/dashboard.json
```

If it reports issues, fix the JSON and re-lint until clean. The error
messages name the frame instance and the exact field. Unknown frame names
come back with the list of valid ones — use it.

Renderer-level failures (a frame whose capability no provider covers) show
up as error cards in the running dashboard; treat those the same way.

## 6. Hand off — serve it

Serve the dashboard and open it for the user:

```bash
zframes serve <dir>/dashboard.json   # live at http://127.0.0.1:5179
```

`serve` hosts the prebuilt runtime pointed at that file, streaming live keyless
data. The user can drag, resize, add, and configure frames **in the browser** —
Save writes the changes straight back to `dashboard.json`. Edits to the file
(yours or theirs) show on reload, so further "add X to my dashboard" requests are
just another edit + the page reloads. Pass `--port <n>` if 5179 is taken.

## Hard rules

- dashboard.json is the only artifact. No React, no CSS, no new frames.
  If the user wants a frame that doesn't exist, say so and list what does.
- Free data only: Hyperliquid (crypto + HIP-3 stock perps), DeFiLlama,
  alternative.me, CoinGecko. There are no API keys to configure — never ask for one.
- Re-read the catalogue every session; never trust remembered frame names.
