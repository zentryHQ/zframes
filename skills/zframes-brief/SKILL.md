---
name: zframes-brief
description: Run the daily market brief on the user's zframes dashboard — analyze the symbols already on it, grade yesterday's calls against what the market did, and append today's entry to the analysis log. Use when the user says "/zframes-brief", "run my daily brief", "what's my market looking like today", "update my brief", or when invoked on a schedule. Reads dashboard.json; writes ONLY the analysis log, never the dashboard.
---

# zframes-brief — your dashboard's daily analyst

This is the daily loop that makes the terminal smarter over time. Each run you:
read the user's dashboard → pull a market snapshot for the symbols on it →
**grade yesterday's calls** against what actually happened → write today's
analysis + a few fresh, checkable calls → append it all to one log file.

The dashboard's `daily-analysis` frame renders the latest entry. You **never**
edit `dashboard.json` — your only write is the analysis log. (Sibling skill:
`/zframes` builds and edits the dashboard; this one only analyzes it.)

## 0. Resolve the CLI

You call the zframes CLI once (`snapshot`). Resolve how to invoke it, same as
the build skill:

- **Standalone (normal case)** → `npx zframes@latest <cmd>`.
- **Inside the zframes monorepo** → `pnpm --silent zframes <cmd>` (run
  `pnpm build:cli` once if `packages/cli/dist/` is missing).

> The CLI isn't published to npm yet, so until it is, use the monorepo
> `pnpm zframes` path. The steps are identical either way.

## 1. Locate the app

The app is a directory with `src/dashboard.json` (inside the monorepo that's
`apps/runtime/`). If the user named one or you're in one, that's the target.
Its analysis log lives at `<app>/public/daily-analysis.json`.

## 2. One-time setup (idempotent — skip if already done)

The brief needs somewhere to render and somewhere to write:

- **The frame.** If `dashboard.json` has no `daily-analysis` frame, tell the
  user and offer to add one (a single instance, e.g. `{"id":"daily-brief",
  "frame":"daily-analysis","title":"Daily Brief","position":{...},"config":{}}`).
  Adding it is the one time this flow touches `dashboard.json` — and only with
  the user's go-ahead. If they decline, the loop still runs; the brief just
  isn't displayed.
- **The log.** If `<app>/public/daily-analysis.json` is missing, create it as
  `{ "entries": [] }`.

## 3. Gather the snapshot (the deterministic half)

```bash
zframes snapshot <app>/src/dashboard.json
```

This prints one JSON object — capture it. Shape:

```jsonc
{
  "date": "2026-06-17",
  "run": {                                      // engine stamp — copy into the entry
    "timestamp": "2026-06-18T07:30:00Z",        // objective, from the CLI
    "model": "claude-opus-4-8",                 // from the runner (flag / ZFRAMES_MODEL env), else null
    "effort": "high",                           // from the runner (ZFRAMES_EFFORT), else null
    "config": null                              // optional runner notes
  },
  "universe": ["xyz:TSLA", "xyz:NVDA", ...],   // every symbol on the dashboard
  "featured": "xyz:TSLA",                       // the featured frame's symbol
  "market": {
    "dayStats":  { "xyz:TSLA": { "markPx", "prevDayPx", "changePct" }, ... },
    "topMovers": { "gainers": [...], "losers": [...] },  // market-wide context
    "candles":   [ { "time","open","high","low","close","volume" }, ... ], // featured, ~14d daily
    "funding":   { "<sym>": [ { "time","fundingRate" }, ... ] },
    "fearGreed": [ { "value","classification","time" }, ... ],
    "global":    { "totalMarketCapUsd","marketCapChangePct24h","dominance" },
    "tvl":       [ { "name","tvl" }, ... ]
  },
  "priorEntry": { ...yesterday's entry, or null on the first run }
}
```

The universe is whatever is on the dashboard — analyze those symbols, not a
remembered watchlist. A provider that was offline shows as `null`; work with
what's there.

## 4. Grade yesterday's calls

If `priorEntry` is non-null, walk its `calls`. Each has a plain-language
`check` (e.g. `"TSLA 24h change < 0"`). Evaluate it against the fresh snapshot
(`market.dayStats[symbol].changePct`, candles, funding…) and produce a
`grades` array — one `{ callId, verdict, note }` per prior call:

- `verdict`: `hit` | `miss` | `partial`
- `note`: one line citing the number that decided it (`"TSLA +0.6% — stayed in range"`)

On the first run (`priorEntry: null`) `grades` is `[]`.

## 5. Write today's analysis

Reason over the snapshot and produce:

- `summary` — a few sentences of real analysis (what moved, what's setting up,
  what to watch) for the symbols on the dashboard. Plain prose; newlines OK.
- `calls` — **2–4 explicit, checkable** calls. Each:
  - `id` (short slug), `symbol`, `direction` (`bullish`|`bearish`|`neutral`),
    `claim` (the call in words), `horizon` (e.g. `"1d"`), and crucially
  - `check` — a plain-language criterion **the next run can grade from a
    snapshot** (`"NVDA 24h change > 0"`, `"BTC funding flips negative"`). A call
    you can't check tomorrow is useless to the loop — make it gradeable.

## 6. Append the entry to the log

Read `<app>/public/daily-analysis.json`, push the new entry onto `entries`
(newest **last**), and write it back. Entry shape:

```jsonc
{
  "date": "<snapshot.date>",
  "run": { ...snapshot.run },                        // engine stamp, copied verbatim
  "universe": [ ...snapshot.universe ],
  "summary": "…",
  "calls":  [ { "id","symbol","direction","claim","check","horizon" }, ... ],
  "grades": [ { "callId","verdict","note" }, ... ]   // grades of the PRIOR entry's calls
}
```

**Copy `run` from the snapshot verbatim.** It records which model/effort produced
this brief, so a changing engine is *visible* in the log instead of silently
skewing the self-grading. If `run.model` or `run.effort` came back `null` (the
runner didn't pass them — see Scheduling), fill them from your own runtime
identity as a best-effort fallback, and keep `run.timestamp` as the CLI set it.

That's the loop's only write. The frame re-fetches on its own interval, so the
brief appears without a reload.

## Hard rules

- **Write only `public/daily-analysis.json`.** Never edit `dashboard.json`,
  the layout, or any other frame — the one exception is the optional, user-
  approved frame-add in step 2.
- **Universe = the dashboard.** Don't analyze symbols that aren't on it; don't
  carry a separate watchlist.
- **Every call must carry a gradeable `check`** — that's what makes tomorrow's
  run able to score it, and the terminal better over time.
- **Free data only** — the snapshot already uses the keyless providers; there
  are no keys to ask for.
- **Append, never rewrite** — keep the full history; the frame computes a
  running hit-rate from it.

## Running it daily

This skill is just the **task**. Scheduling it is the user's own Claude Code
**`/schedule`** — normal Claude Code functionality, not something this skill
sets up. To make the brief run every morning, the user schedules
`/zframes-brief` with `/schedule` (or whatever scheduler they prefer). Don't
write crontab lines or wrap it in `claude -p` — point them at `/schedule`.

**The one requirement:** whatever runs it must be able to **write
`<app>/public/daily-analysis.json`** — i.e. it runs with access to the app.
- A runner that has the app's files (it's local to that machine, or a routine
  that clones the repo and commits the updated log) works.
- A scheduler with no access to where the log lives can update nothing — if the
  brief isn't appearing, that's the first thing to check.

**Engine stamp on a scheduled run:** the scheduled agent knows its own model and
effort, so fill `run.model` / `run.effort` from your runtime identity (step 6).
If the scheduler can set env, `ZFRAMES_MODEL` / `ZFRAMES_EFFORT` let
`zframes snapshot` stamp them authoritatively instead — either way the engine
ends up on record so a later model change is visible in the history.
