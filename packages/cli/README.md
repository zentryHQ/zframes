# zframes

AI-personalizable, **keyless** market dashboards — served live from a single `dashboard.json`.

An agent reads the frame catalogue, emits a `dashboard.json` spec, and `zframes`
validates it and serves it as a live, in-browser-editable market terminal. All
data comes from free public APIs (Hyperliquid, DeFiLlama, alternative.me,
CoinGecko) — **no API keys, ever.**

## Quick start

```bash
# scaffold a bare, valid dashboard.json (envelope only — you fill in the frames)
npx zframes@latest init my-dashboard --title "My Terminal"

# serve it live at http://127.0.0.1:5179
# — drag / resize / add / edit frames in the browser; Save writes back to the file
npx zframes@latest serve my-dashboard/dashboard.json
```

Nothing to clone, install, or build — `npx` fetches the CLI (which bundles the
dashboard runtime) on each run.

## Commands

| Command | What it does |
|---|---|
| `zframes init [dir]` | Write a bare, schema-valid `dashboard.json` (the fixed envelope; you fill in `frames`). Flags: `--title`, `--author`, `--force`. |
| `zframes serve [file]` | Serve `dashboard.json` as a live, editable terminal at `127.0.0.1:5179` (`--port` to change). In-browser edits Save straight back to the file. |
| `zframes catalogue` | Print every available frame as JSON Schema — this is what a generating agent reads. |
| `zframes lint <file>` | Validate a `dashboard.json`; exits non-zero with readable, per-frame errors. |
| `zframes snapshot <file>` | Gather a keyless market snapshot for the dashboard's symbols (feeds the daily-brief loop). |

Where a file argument is optional, it defaults to `./dashboard.json`.

## How it works

`dashboard.json` is the only artifact you own. `serve` hosts a prebuilt browser
runtime pointed at that file, streaming live keyless data and rendering each
frame on a CSS grid. Invalid frame configs render as per-frame error cards —
never a crashed dashboard — so a generating agent gets a tight feedback loop via
`lint`.

## Scope

- **Keyless only** — Hyperliquid (crypto + HIP-3 stock perps), DeFiLlama,
  alternative.me, CoinGecko. No keys anywhere.
- **Stocks-first** — equity perps via Hyperliquid HIP-3 builder dexes, with
  crypto alongside.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Repository: <https://github.com/zentryHQ/zframes>
