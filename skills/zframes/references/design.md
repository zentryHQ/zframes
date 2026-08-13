# Designing the dashboard

Read this before writing or editing anything in the `frames` array — on the
**create** path (after the interview) and on any **update** that adds, resizes,
or rearranges frames. It assumes you've read the catalogue summary
(`catalogue --summary`, SKILL.md step 2).

Filling `frames` is a **design job, not a dump** — the runtime renders exactly
what you write, so the difference between widget soup and a designed terminal
is decided here, in three passes: a deliberate look (4a), a curated frame set
(4b), and a composed layout (4c).

## 4a. Give it a look — pick ONE theme preset

The summary's `themePresets` are complete, tested identities — colour, type,
card surface, and a matching animated backdrop that tracks the accent. Choose
by signal:

- The user picked one in the interview, or named a vibe: honour it
  ("terminal look" → `terminal`, "classy / premium" → `gold-noir` or
  `editorial`, "calm, easy on the eyes" → `graphite` or `nord`).
- Otherwise match the desk: metals/gold → `gold-noir`; macro/rates →
  `graphite` or `nord`; a crypto-native desk → `synthwave` or `terminal`;
  a stocks desk, or any doubt → `zframes` (the signature look — `init` already
  wrote it, so applying it means touching nothing).

Apply a preset by copying its `theme`, `typography`, and `appearance` objects
into the envelope **verbatim**, and setting `background.projectId` to its
scene's `projectId` (from the summary's `backgroundScenes`; keep
`background.type: "unicorn"`). Never mix two presets and never invent your own
hues — drift comes later, from user asks.

Beyond the preset, touch envelope fields only when the user asks: "more
spacing" → bump `grid.gap`, "square corners" → `appearance.radius: 0`, "muted
accent" → lower `theme.accentSat`, "warmer/blacker cards" → shift
`theme.baseHue` / lower `theme.baseSat`, "stop the numbers jumping" →
`typography.numericStyle: "tabular"`, "bigger/smaller text" →
`typography.scale`, "colourblind / custom gain-loss colours" →
`theme.upColor`/`theme.downColor`, "glassy cards" → lower
`appearance.surfaceOpacity`, "no animation" → `background.type: "gradient"`,
"show it in baht / euros / yen" → `currency.code: "THB"|"EUR"|"JPY"` — 146 ISO
codes are valid (lint rejects the rest by name); every market figure converts
from USD at the live reference rate, and one card can opt out with its own
`"currency": "USD"` beside `position`.

**Denominating a board in another currency.** `currency.code` is the whole job —
you do NOT convert anything yourself, and you never touch a frame's numbers.
Percentages, ratios and quantities are unaffected, and US-macro frames (Treasury,
CPI, national debt) deliberately stay in dollars, so a baht board still shows the
US national debt in USD. That is correct, not a bug.

## 4b. Curate the frame set — every card earns its slot

The catalogue holds ~270 frames; a good board ships **20–35 cards in 3–5
zones** (a "both assets" desk can run to ~45). Never dump the catalogue, and
never ship a sparse husk either. Prefer the best frame per job over three
near-duplicates (one TVL view, not the treemap AND the chart AND the table),
and skip categories the interview made irrelevant. Pure-content frames
(`note`, `video`, `quote`, `dino-game`, …) stay opt-in — add them only if the
user asks — with one encouraged exception: a couple of small `image` /
`image-gallery` tiles showing the board's own assets as decoration (4c);
`heading`s are structure (4c).

Start from this **spine** — the cards every desk carries, populated with the
interview's tickers:

- **`price-liveline` hero** — the user's 2–8 main symbols streaming in one
  live race, `normalize: true` so stocks and crypto share an axis. Big, on top.
- **A focus row of `price-chart` cards** — one per main ticker (usually four
  across), all `"interval": "5m"`, `title` = the ticker, a distinct `color` hex
  per card, split two `"mode": "candle"` / two `"mode": "line"`. Stocks default
  when the user named fewer than four: **NVDA & TSLA as candles, AAPL & AMD as
  lines** (NVDA `#76b900`, TSLA `#e82127`, AAPL `#0a84ff`, AMD `#f5a623`). On a
  crypto desk, the user's coins instead.
- **Market pulse** — `top-movers`, `fear-greed`, a normalized `price-compare`
  of the user's tickers, `price-ticker`.
- **The macro trio** — `rates-board` (NY Fed + Treasury rates), `yield-curve`
  (+ 2s10s spread), `inflation-pulse` (CPI), one row under a "Macro" heading.
  None need config — schema defaults are sensible.
- **Desk utilities** — `clock` (`"timezone": "America/New_York"`,
  `"label": "New York"`) and `market-hours` (`"exchanges": ["NYSE","NASDAQ"]`
  for a US desk, empty for the world set).

Then build the remaining zones from the summary's categories, by asset class:

- **Stocks desk** → `equities` as a company deep-dive zone on the main focus
  ticker (profile, fundamentals, earnings, analyst coverage, `short-volume`
  with `"sort": "shortPct"`); `derivatives` for the hero ticker's options;
  more `macro` (credit spreads, housing, labor); `sentiment` (`news-feed`).
- **Crypto desk** → `crypto` (dominance, `tvl-treemap`, DEX/stablecoin views),
  a `bitcoin` network cluster (as one `group` — see below), `onchain` cycle
  gauges, `derivatives` (funding, options), `sentiment`.
- **Both** → both sets, at the budget's upper end.

Pick 4–8 frames per zone by their summary descriptions, then fetch their full
schemas (SKILL.md step 2, phase 2) before writing any config. Symbol-bearing
frames take the user's tickers; context frames ride their defaults.

## 4c. Lay it out — compose, don't scatter

The grid is 12 columns, `rowHeight: 96` (set by `init`). Place every frame with
an explicit `position: { x, y, w, h }`. What separates a designed board from a
widget dump:

- **Sizes come from the catalogue, not from guessing.** Each frame's `layout`
  entry is the span it reads well at (`w`/`h`) plus the floor and ceiling its
  UI can survive (`minW`/`minH` → `maxW`/`maxH`; a missing max means the frame
  scales to whatever the board is). Start at `w`/`h` and never place a card
  outside the envelope — lint errors on both ends, and the render symptom is
  the sneaky kind: an undersized chart squeezes its axis away, an oversized
  stat is one number in an acre of empty card. Charts generally want `h: 4` —
  don't squeeze one to 3 rows to save space.
- **Pack every row to exactly 12 columns** (6+6, 4+4+4, 8+4, 3+3+3+3, …) — a
  row that sums to 11 leaves a hole that reads as broken. Give the cards in one
  row the same `h`, so the next row starts flush.
- **Zone the board with `heading` frames** (full-width `w: 12, h: 1`) — one per
  zone, 3–5 zones, hero zone first (e.g. "Markets", "NVDA Deep Dive", "Macro",
  "Desk"). Headings render as bare section dividers (no card); they're what
  makes a dashboard read as designed.
- **Hierarchy: hero → focus → context.** The liveline spans wide up top
  (`w: 12, h: 3`, or `w: 8` beside one tall card), the focus row under it, and
  later zones' cards no bigger than the zone above's. Never let a utility card
  (clock, fear-greed) outsize a chart.
- **Cluster small stats into a `group`** (below): four related gauges as one
  2×2 card read designed; four loose cards read scattered.
- **Decorate with the assets themselves — sparingly.** One to three small
  `image` tiles (or one `image-gallery` rotating through the watchlist)
  showing the board's own assets give it identity, and they are the perfect
  **row filler**: a 2-wide logo tile completes a row that would otherwise sum
  to 10. Keep them small (`w: 2–3`, the height of their row) and cap the total
  at ~5% of the board — decoration seasons a desk, it never competes with a
  chart for space. Use the same keyless logo CDNs the framework's own chrome
  uses, with `"fit": "contain"` (cover crops a square logo) and the asset name
  as `alt`:
  - stocks/ETFs (bare ticker, no `xyz:`):
    `https://assets.parqet.com/logos/symbol/NVDA?format=png`
  - crypto (lowercase ticker):
    `https://assets.coincap.io/assets/icons/btc@2x.png`

  `image` renders chrome-less by default (no auto-title), so a tile reads as
  pure decoration. Skip the tile for a long-tail ticker you aren't sure the
  CDN carries — the `image` frame has no monogram fallback, and a broken
  image is worse than no decoration.
- **Titles: usually omit.** Every frame renders a polished default title from
  its catalogue `label`, so leave `"title"` unset — don't re-state the default,
  never abbreviate. Set a per-instance `"title"` (sibling of
  `frame`/`position`) only where the default can't know the label: **required
  on every `price-chart`** (the ticker: `"title": "TSLA"`, not
  `"PRICE CHART"`), and useful to tell otherwise identical cards apart (which
  outlet a `news-feed` shows). Ignored by `heading`.
- No overlaps; nothing past column 12; every `id` unique and human-readable.
  Only set config fields the user cares about — schema defaults cover the rest,
  except required fields (the catalogue's `required` list).

## Card-level extras — annotations, clusters, second venues

**Annotating a chart with past events.** When the user wants to see what moved a
chart — "mark the Fed meetings on the BTC chart", "show me where the hack was" —
add an `events` array to **that card**, beside `position` (NOT inside `config`):

```json
{
  "id": "btc-history", "frame": "price-events",
  "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
  "events": [
    { "date": "2026-06-12", "label": "FOMC +25bp",
      "note": "Powell signalled one more hike.",
      "color": "#f5a524", "url": "https://www.federalreserve.gov/" }
  ],
  "config": { "symbol": "BTC", "lookback": "3M" }
}
```

The card's chart draws them on its time axis (dashed rule + a flag you hover for
the detail). There is **no dashboard-wide events list** — markers belong to the
chart they explain, so a date that matters on two charts is written on both.
`date` is ISO `YYYY-MM-DD` (add `THH:MM` for intraday); only `date` and `label`
are required. Only frames the catalogue marks **`annotatable`** draw them (the
history charts — `price-events`, `price-compare`, `protocol-tvl-chart`,
`funding-rate-chart`, the metals/on-chain/macro charts …); on any other frame the
field parses fine and shows nothing. The **`price-events`** frame (single-symbol
price history, 7D–1Y) is the one built for this. A marker outside a chart's
window isn't drawn, so widen `lookback` to reach older ones. Never invent events
or dates you aren't sure of — ask the user, or leave them out.

**Grouping frames that belong together.** When several cards are one idea — "put
the four BTC network stats in one block", "a chart with its key numbers under it",
"split this panel in two" — use the **`group`** frame. Its children go in a
`children` array beside `position` (NOT inside `config`), and each child is a
normal frame instance whose `position` is in the **group's own** `columns` ×
`rows`, not the board's 12:

```json
{
  "id": "btc-block", "frame": "group",
  "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
  "title": "Bitcoin Network",
  "config": { "columns": 2, "rows": 2, "gap": 8 },
  "children": [
    { "id": "fees", "frame": "btc-fees",
      "position": { "x": 0, "y": 0, "w": 1, "h": 1 }, "config": {} },
    { "id": "mempool", "frame": "btc-mempool",
      "position": { "x": 1, "y": 0, "w": 1, "h": 1 }, "config": {} },
    { "id": "hashrate", "frame": "btc-hashrate",
      "position": { "x": 0, "y": 1, "w": 2, "h": 1 }, "config": {} }
  ]
}
```

The whole cluster then moves and resizes as ONE card when the user rearranges the
board, instead of coming apart. The group's rows are fractions of its own height,
so the children always fill it exactly — size the group with `position` and lay the
children out in the small grid. `config.columns`/`rows` default to `2`×`2`; keep
them small (a group is a cluster, not a second dashboard, and 24 children is the
hard ceiling). `title` on the group renders as a label above the cluster — reach
for that instead of spending a row on a `heading` child. **Groups cannot contain
groups**: a `children` on a child is rejected outright, so lay the whole cluster
out in one group. The group itself draws no card by default (the children's own
cards carry the look); add `"panel": true` to its config for a surrounding
surface. Catalogue entries carry `"container": true` for frames that work this way.

**Sourcing a frame from a second venue.** Data routing is first-match by
capability, so a frame only reads another venue if you say so: set
`"source": "bitkub"` (or `"nasdaq"`) in the frame's `config` — supported on
`price-chart`, `top-movers`, `price-events`, `rsi-momentum`, `return-calendar`,
`return-distribution` and `order-book-depth`; the catalogue's enum per frame is
the authority. The field is **`source`**, not `venue`. Symbols are source-native:
Bitkub lists bare tickers (`KUB`, `BTC`) and has **no** HIP-3 stock perps, so
never send it an `xyz:` symbol; Nasdaq wants a plain US ticker (`NVDA`, not
`xyz:NVDA`). Bitkub is the only venue with an order book, which is what the
`order-book-depth` frame renders (bid/ask ladder + spread). Pin `nasdaq` when a
stock card should show the real listing rather than its perp — its volume and
open interest are the listing's, not Hyperliquid's book — but note it serves
**daily bars only** and can't back a card that scans a whole universe
(`top-movers`). A Bitkub or Nasdaq `price-chart` has no live tick (only
Hyperliquid streams quotes) — it polls candles, which is expected.
