---
name: zframes
description: Build, update, serve, or fork the user's personal zframes market dashboard. Use when the user says "/zframes", "build me a dashboard", "set up my terminal", "make me a market terminal", "add X to my dashboard", "start/open/serve my dashboard", "fork this dashboard <url>", "run this shared zframes link", or wants a personalized live market dashboard (crypto + stocks). If they give a zframes explorer link (a .../dashboard/<id> URL), fork it onto their machine. If a dashboard already exists and the user just wants to start it, serve it — don't rebuild from scratch. Writes a validated dashboard.json and serves it live with the CLI — the agent never writes React.
---

# zframes — your dashboard, generated

You set up **and run** the user's dashboard by driving the **zframes CLI** and
writing a `dashboard.json` spec. The CLI *is* the runtime: it serves a prebuilt
dashboard app pointed at that one file, editable in the browser. You only ever
write JSON. Never create or edit `.tsx` files for this task.

**Three jobs, one skill — serve, update, or create.** Decide which the request
is *before* anything else (step 1). "Start / open / serve my dashboard" just
serves the one the user already has — the most common ask once a dashboard
exists — and skips the interview and `init` entirely. Only the *create* path
runs the full build below.

## 0. The CLI

The runtime ships as the `zframes` CLI on npm. Always invoke it with
**`npx --yes zframes@latest <cmd>`** — npx fetches the published CLI (which bundles the
dashboard runtime) per run, so there's nothing to clone, install, or keep
current. The commands you'll use below are `init`, `providers`, `catalogue`,
`lint`, and `serve` (written `zframes <cmd>` for brevity — always run them
through `npx`).

## 1. Route the request — serve, update, or create

**Classify the ask first; it decides everything below** — including which
reference files you read. Only one of the four jobs builds anything; never run
the interview or `init` unless you're genuinely creating a dashboard the user
doesn't have yet.

- **Serve / open / start an existing dashboard** — "start my dashboard", "open
  my terminal", "serve it", or a bare `/zframes` when the user already has one.
  This is the common case once a dashboard exists. **Don't init, don't interview,
  don't read the catalogue or any reference file.** Run `zframes list` to see
  what's there, then jump straight to **step 6** and serve: a bare
  `zframes serve` opens the default (the `*` in the list),
  `zframes serve <name>` a specific one. That's the whole job.
- **Update an existing dashboard** — "add X", "swap the tickers", "change the
  theme". Run `zframes list` (the `*` marks the default) or find the
  `dashboard.json` the user is serving / one in the current directory. **Read it
  first**, then change only what they asked for. If you're adding, resizing, or
  rearranging frames, read the catalogue (step 2) and
  **`references/design.md`** (the design method + the card-level fields:
  events, groups, `source`, currency) before editing the `frames` array; then
  lint + serve (steps 5–6). Don't re-init — you'd wipe their frames.
- **Create a brand-new dashboard** — only when the user wants one they don't yet
  have (or explicitly asks for a fresh one alongside their others). Name it,
  `init` it (below), then run the full build: catalogue summary (step 2), the
  interview (**read `references/interview.md`** before asking anything), the
  design (**read `references/design.md`** before writing any frame JSON), then
  lint + serve (steps 5–6).
- **Fork a shared dashboard** — the user gives a zframes **explorer link**
  (`.../dashboard/<id>` or `.../dashboard/<id>/dashboard.json`), or pastes the
  "fork" prompt. They want that shared dashboard **on their machine** to keep
  and extend. Don't interview or build — **read `references/fork.md`** and
  follow it: fetch, land in the store, lint + serve, offer to personalize.

The only artifact is a single `dashboard.json`. There is **no app to scaffold** —
the runtime comes from the CLI. Dashboards live in a **global store**
(`$XDG_CONFIG_HOME/zframes/dashboards`, default `~/.config/zframes/dashboards`),
so the user can run `zframes` from anywhere and keep several side by side, each
addressed by a short **name** (`main`, `crypto`, …). `zframes list` shows them
all, the `*` marking the one a bare `zframes serve` will open.

To **create** one, give it a **name** and `init` it into the store — don't
hand-write the envelope:

  ```bash
  npx --yes zframes@latest init <name> --title "<dashboard title>" --author "<who>"
  ```

A bare token like `crypto` lands in the store as
`<store>/dashboards/crypto/dashboard.json` and becomes the **default** if you
don't have one yet (so a later bare `zframes serve` opens it; pass `--default`
to force it).
This writes a bare, already-valid dashboard — the fixed envelope, modelled on
package.json: `version` (semver string), `title`, `author` (pass `--author` if
the user gave a name, else it's left blank), then the 12-column `grid`
(geometry — columns/rowHeight/`gap`), the unicorn `background`, the `theme`
colours (`accentHue`/`accentSat` for the accent + `baseHue`/`baseSat` for the
dark card-surface tint + `upColor`/`downColor` for gain/loss), the `typography`
(`fontFamily` sans/mono/serif + `numericStyle` proportional/tabular + `scale`
global text size), the card-surface `appearance`
(`radius`/`borderStrength`/`surfaceOpacity`/`density`/`elevation`), and the
display `currency` (`{ code: "USD" }` by default) — with an
**empty `frames` array**. You never author that boilerplate or its geometry by
hand; you only fill in `frames` (step 4). That single file is everything the
user owns; sibling files it references (a local
image) live next to it in the dashboard's own `dashboards/<name>/` folder, so
each dashboard's assets stay isolated. `init` refuses to clobber an existing
file unless you pass `--force`.

(Prefer a plain file over the store? Pass a path — `init ./my-dir` or
`init ~/dash.json` — and every command takes that path too. A token with a
`/` or a `.json` suffix is always a path; a bare token is always a store name.)

## 2. Read the catalogue — always, before generating

The catalogue is read in **two phases** — the full dump (~270 frames of JSON
Schema, ~400 KB) is far too big to read whole, and you don't need most of it.

**Phase 1 — browse.** Before choosing anything:

```bash
npx --yes zframes@latest catalogue --summary > /tmp/zframes-summary.txt
```

Read that file fully (~45 KB of plain text): every frame as one
`name — description` line grouped by category, the category taxonomy, and the
**design vocabulary** — the named theme presets *with the exact spec values to
write* and the background scenes with their `projectId`s. This is the menu you
curate frames and cosmetics from in step 4.

**Phase 2 — fetch the schemas you'll actually use.** Once the design pass has
picked the frame set, get the full entries — config schema plus each frame's
**designed size and resize floor** (`layout`: `w`/`h`/`minW`/`minH`/…) — for
exactly those frames:

```bash
npx --yes zframes@latest catalogue price-liveline price-chart yield-curve ... > /tmp/zframes-frames.json
```

Then **read the file** with your file reader — redirect to a file rather than
reading piped stdout, so nothing truncates. Frame names, config fields, enum
values, and sizes come from here — never from memory. The catalogue grows; your
memory doesn't. An unknown frame name makes the command exit 1 with the valid
list — that's your typo feedback, same as lint.

## 3. Interview the user — read `references/interview.md` first

On the create path, interview the user before building — but **read
`references/interview.md` before asking anything**. It holds the whole funnel:
a three-round narrowing (asset class → categories → 3–5 specific tickers, with
one optional theme-preset question riding along), the option menus per asset
class, and the **xyz symbol reference** that maps every category to the tickers
the dex actually carries. The interview picks symbols and (optionally) a look —
never frames; you assemble the board yourself in step 4.

## 4. Design the dashboard — read `references/design.md` first

Fill the `frames` array of the file `init` scaffolded (or the existing file for
updates). This is a design job, not a dump, and **`references/design.md` is the
method — read it before writing any frame JSON.** It covers the three passes
(4a apply ONE theme preset, 4b curate 20–35 cards in 3–5 zones from a mandatory
spine, 4c compose the layout — catalogue sizes, rows packed to 12, headed
zones, hierarchy, small asset-logo tiles as decoration and row fillers) plus
the card-level fields you'll need while writing: event annotations, `group`
clusters, pinning a frame to a second venue with `source`, and
per-board/per-card display currency.

## 5. Lint — the feedback loop

```bash
npx --yes zframes@latest lint <name>   # the store name (or a path to a dashboard.json)
```

If it reports issues, fix the JSON and re-lint until clean. The error
messages name the frame instance and the exact field. Unknown frame names
come back with the list of valid ones — use it. Lint also enforces the design
floor: a frame placed under its `layout` minimums, overlapping cards, a group
child overflowing its group's own `columns`/`rows`, and a group-in-a-group all
fail with the offending numbers named.

Renderer-level failures (a frame whose capability no provider covers) show
up as error cards in the running dashboard; treat those the same way.

## 6. Hand off — serve it

Serve the dashboard and open it for the user:

```bash
npx --yes zframes@latest serve <name>   # the store name; live at http://127.0.0.1:37263
```

**Live data is installed once, not assumed.** A bare install ships no data
providers: it renders plainly-simulated demo numbers, badges the header
"demo data", and `serve` says so at startup. Before the first serve on a
machine (or whenever `serve` prints the demo notice / the header shows the
badge), install the free keyless fleet:

```bash
npx --yes zframes@latest providers add keyless   # one-time; prints what it contacts + where the terms live
```

That printout is the point — it is the user's consent surface, so let it show
rather than suppressing it. `zframes providers` lists what's installed.
(An older published CLI without this command always streams live data — if
`providers` errors as unknown, just serve.)

`serve` hosts the prebuilt runtime pointed at that dashboard, streaming live
keyless data once the fleet is installed. A bare `zframes serve` (no name) opens the **default** store
dashboard, and when the store holds several the header title becomes a
**dashboard chooser** — the user opens it, picks another, and the page reloads
into it, no restart. The user can drag, resize, add, and configure frames **in the
browser** — Save writes the changes straight back to `dashboard.json`. Edits to
the file (yours or theirs) show on reload, so further "add X to my dashboard"
requests are just another edit + the page reloads. Pass `--port <n>` if 37263 is
taken.

**Verify it renders designed, not just valid.** Lint proves the JSON; it can't
see pixels. After serving a *newly built or reshaped* board, if you have a
browser tool, open `http://127.0.0.1:37263` and sweep once for: error cards
("Invalid configuration", "Unknown frame", missing-capability), cards stuck
empty, rows with holes, and clipped card interiors — fix the spec and reload.
A **"demo data" pill in the header is not a bug**: it means no data providers
are installed — run `zframes providers add keyless` and restart the serve.
(Give live data a few seconds to settle before judging a card empty; a chart's
draw-in animation is not a bug.) No browser tool? Tell the user exactly what to
glance for and fix what they report. Skip this sweep for a plain serve or a
one-field update — the diff is the proof there.

## Hard rules

- **Serve when they just want to look.** If a dashboard already exists and the
  user says start / open / serve (or sends a bare `/zframes`), serve it
  (step 1 → step 6) — no interview, no `init`, no rebuild. Build or re-interview
  only when they're creating a new dashboard or changing an existing one.
- **The interview picks tickers (and at most a look), never frames.** The
  onboarding funnel — asset class → categories → specific tickers, with one
  optional theme-preset question riding along — exists only to choose the
  symbols and the vibe. You assemble the board: never ask which frames or
  widgets to include, never show or read back frame names as options.
- **Curate and compose — the two design invariants.** 20–35 cards in 3–5
  headed zones, sizes from each frame's catalogue `layout` (never outside its
  `minW`/`minH` → `maxW`/`maxH` envelope), every row packed to 12 columns,
  exactly one theme preset applied verbatim. A catalogue dump and a sparse
  husk are both failures.
- dashboard.json is the only artifact. No React, no CSS, no new frames.
  If the user wants a frame that doesn't exist, say so and list what does.
- Free data only: 29 keyless sources — Hyperliquid (crypto + HIP-3 stock perps),
  Nasdaq, CoinGecko, DeFiLlama, Deribit, Cboe, mempool.space, the U.S. Treasury,
  the NY Fed, BLS, SEC EDGAR, FRED, LBMA metals, and more. The whole fleet is one
  `zframes providers add keyless` (step 6); there are no API keys to configure —
  never ask for one.
- Re-read the catalogue every session; never trust remembered frame names.
