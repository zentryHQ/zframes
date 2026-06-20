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
**`npx --yes zframes@latest <cmd>`** — npx fetches the published CLI (which bundles the
dashboard runtime) per run, so there's nothing to clone, install, or keep
current. The commands you'll use below are `init`, `catalogue`, `lint`, and
`serve` (written `zframes <cmd>` for brevity — always run them through `npx`).

## 1. Pick where the dashboard lives — and scaffold it

The only artifact is a single `dashboard.json`. There is **no app to scaffold** —
the runtime comes from the CLI.

- **Updating an existing dashboard?** Find the `dashboard.json` the user is
  serving (or one in the current directory), read it first, and go to step 2 to
  change only what they asked for. Don't re-init — you'd wipe their frames.
- **New dashboard?** Pick a directory for it — the current directory, or a fresh
  one the user names (e.g. `~/zframes`) — then **scaffold the file with `init`
  instead of hand-writing the envelope**:

  ```bash
  npx --yes zframes@latest init <dir> --title "<dashboard title>" --author "<name>"
  ```

  This writes a bare, already-valid `<dir>/dashboard.json` — the fixed envelope,
  modelled on package.json: `version` (semver string), `title`, `author` (pass
  `--author` if the user gave a name, else it's left blank), then the 12-column
  `grid` (geometry — columns/rowHeight/`gap`), the unicorn `background`, the
  accent `theme` (`accentHue`/`accentSat`), and the card-surface `appearance`
  (`radius`/`borderStrength`/`surfaceOpacity`/`density`/`elevation`) — with an
  **empty `frames` array**. You never author that boilerplate or its
  geometry by hand; you only fill in `frames` (step 4). The
  spec is `<dir>/dashboard.json`; that single file is everything the user owns.
  Any sibling files it references (a `daily-analysis.json` brief, a local image)
  live next to it in `<dir>`. `init` refuses to clobber an existing file unless
  you pass `--force`.

## 2. Read the catalogue — always, before generating

```bash
npx --yes zframes@latest catalogue > /tmp/zframes-catalogue.json
```

Then **read `/tmp/zframes-catalogue.json`** with your file reader (it's ~25 KB of
JSON Schema). Redirect to a file and read the file rather than reading the
command's piped stdout — that guarantees the *complete* catalogue even if the
shell truncates large piped output. Frame names, config fields, and enum values
come from here — never from memory. The catalogue grows; your memory doesn't.

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
   bare. **Default to stocks: build a US-stocks dashboard unless the user
   explicitly names a crypto asset (BTC, ETH, …) or asks for crypto.** When they
   don't mention crypto, use stock tickers in every frame and include no
   crypto-only frames. Also note which 1–2 are the **main focus**
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

   On a stocks dashboard, prefer stock-relevant extras (`top-movers`,
   `funding-rate-chart`/`funding-heatmap`, `short-volume`); reach for the
   crypto-only frames (`bitcoin-dominance`, `tvl-treemap`) only when the
   dashboard actually includes crypto.

Everything else is your call, not a question: add zone `heading`s, feature the
centerpiece, and include a tasteful default context set (stocks, unless the user
asked for crypto). Add a trading-plan
`note`, a logo `image`, or the `dino-game` only if the user brings it up — don't
prompt for them. The user can always refine later with "add X to my dashboard".

If you render this as a picker (e.g. AskUserQuestion), label steps and options
by interest ("Market mood", "What's moving", "On-chain flows"), never by frame
name ("fear-greed", "tvl-treemap").

For "update my dashboard" requests, read the existing `dashboard.json` first
and change only what they asked for.

## 4. Fill in the frames

Edit the file `init` scaffolded (or the existing one for updates): add objects to
the `frames` array. **Leave the envelope alone** — `version`, `grid`,
`background`, `theme`, and `appearance` are already set; only touch them if the
user explicitly asks (e.g. "more spacing" → bump `grid.gap`, "square corners" →
`appearance.radius: 0`, "muted accent" → lower `theme.accentSat`, "glassy cards"
→ lower `appearance.surfaceOpacity`, "no animation" → `background.type:
"gradient"`).

**Default frame set — the spine of every new dashboard.** Build these first
(using the symbols from the interview), then add the interest-driven frames
around them. Skip one only if the user explicitly opts out:

- **`price-liveline` hero** — the user's 2–8 main symbols streaming together in
  one live race. Keep `normalize: true` so stocks and crypto share an axis.
  Place it big and up top: `w: 8–12, h: 3`.
- **Four `price-chart` cards on one row** — each `w: 3, h: 3` (3 × 4 = 12
  columns, so all four sit side by side on the same row), all
  `"interval": "5m"` (intraday), `title` = the ticker, and **color-coded** (a
  distinct `color` hex per card). Split the rendering two and two: two
  `"mode": "candle"`, two `"mode": "line"`. Default stocks picks when the user
  named fewer than four — **NVDA & TSLA as candles, AAPL & AMD as lines**
  (e.g. NVDA `#76b900`, TSLA `#e82127`, AAPL `#0a84ff`, AMD `#f5a623`).
- **`short-volume`** for the US-stock tickers (FINRA reported short volume; use
  `"sort": "shortPct"`): `w: 5, h: 4`.
- **The macro trio — always include all three.** Keyless official-data context
  every dashboard should carry; group them in a row under a "Macro" heading
  (4 + 4 + 4 = 12 columns). None need config — schema defaults are sensible:
  - **`rates-board`** — NY Fed SOFR / effective fed funds / repo rates +
    Treasury average rates. `w: 4, h: 4`.
  - **`yield-curve`** — the US Treasury par yield curve + the 2s10s spread.
    `w: 4, h: 3`.
  - **`inflation-pulse`** — BLS CPI, month-over-month / year-over-year + trend.
    `w: 4, h: 3`.
- **`clock` + `market-hours` — always include both.** A `clock` set to the
  market's timezone (`"timezone": "America/New_York"`, `"label": "New York"`),
  `w: 3, h: 2`; and `market-hours` for exchange open / closed status with next
  open/close countdowns (`"exchanges": ["NYSE","NASDAQ"]` for a US-stocks desk,
  or leave it empty for the world set), `w: 4, h: 4`.

Layout rules for the frames:

- The grid is 12 columns, `rowHeight: 96` (set by `init`). Place each frame with
  an explicit `position: { x, y, w, h }` in grid units.
- **Group into zones.** Put a `heading` frame (full-width `w: 12, h: 1`) above
  each group of related frames — e.g. "Markets", "On-chain", "Desk". Headings
  render as bare section dividers (no card); they're what make a dashboard read
  as designed instead of a widget dump. A good dashboard has 2–3 zones.
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

## 5. Lint — the feedback loop

```bash
npx --yes zframes@latest lint <dir>/dashboard.json
```

If it reports issues, fix the JSON and re-lint until clean. The error
messages name the frame instance and the exact field. Unknown frame names
come back with the list of valid ones — use it.

Renderer-level failures (a frame whose capability no provider covers) show
up as error cards in the running dashboard; treat those the same way.

## 6. Hand off — serve it

Serve the dashboard and open it for the user:

```bash
npx --yes zframes@latest serve <dir>/dashboard.json   # live at http://127.0.0.1:37263
```

`serve` hosts the prebuilt runtime pointed at that file, streaming live keyless
data. The user can drag, resize, add, and configure frames **in the browser** —
Save writes the changes straight back to `dashboard.json`. Edits to the file
(yours or theirs) show on reload, so further "add X to my dashboard" requests are
just another edit + the page reloads. Pass `--port <n>` if 37263 is taken.

## Hard rules

- dashboard.json is the only artifact. No React, no CSS, no new frames.
  If the user wants a frame that doesn't exist, say so and list what does.
- Free data only: Hyperliquid (crypto + HIP-3 stock perps), DeFiLlama,
  alternative.me, CoinGecko. There are no API keys to configure — never ask for one.
- Re-read the catalogue every session; never trust remembered frame names.
