# zframes

AI-personalizable, **keyless** market dashboards — served live from a single `dashboard.json`.

An agent reads the frame catalogue, emits a `dashboard.json` spec, and `zframes`
validates it and serves it as a live, in-browser-editable market terminal. All
data comes from free public APIs — Hyperliquid, CoinGecko, DeFiLlama, Deribit,
mempool.space, the U.S. Treasury, the NY Fed, BLS, SEC EDGAR, and more —
**no API keys, ever.**

## Quick start

```bash
# scaffold a bare, valid dashboard in your global store (envelope only —
# you fill in the frames). A named dashboard becomes the default if you have none.
npx zframes@latest init my-terminal --title "My Terminal"

# serve it live at http://127.0.0.1:37263 — a bare name resolves from the store,
# and no argument at all serves your default dashboard.
# Drag / resize / add / edit frames in the browser; Save writes back to the file.
npx zframes@latest serve my-terminal
```

A dashboard is one `dashboard.json`. Name one and it lives in your global store
(`$XDG_CONFIG_HOME/zframes`, default `~/.config/zframes`) so the CLI runs from
anywhere and holds many; or point any command straight at a file path
(`serve ./dashboard.json`) instead. Nothing to clone, install, or build — `npx`
fetches the CLI (which bundles the dashboard runtime) on each run.

## Commands

| Command | What it does |
|---|---|
| `zframes init [name\|dir]` | Write a bare, schema-valid `dashboard.json` (the fixed envelope; you fill in `frames`). A name lands in the store and becomes the default if you have none. Flags: `--title`, `--author`, `--default`, `--force`. |
| `zframes serve [name\|file]` | Serve a dashboard as a live, editable terminal at `127.0.0.1:37263` (`--port` to change). In-browser edits Save straight back to the file; switch store dashboards from the in-app header. |
| `zframes list` | List the dashboards in your global store (marks the default). |
| `zframes use <name>` | Set the default store dashboard. |
| `zframes catalogue` | Print every available frame as JSON Schema — this is what a generating agent reads. |
| `zframes lint <name\|file>` | Validate a dashboard; exits non-zero with readable, per-frame errors. |
| `zframes snapshot [name\|file]` | Gather a keyless market snapshot for the dashboard's symbols (feeds the daily-brief loop). |

Any argument with a `/` or a `.json` suffix is a **file path**; a bare token is a
**store name**. Where the target is optional (`serve`, `snapshot`), it resolves
your default store dashboard, else `./dashboard.json`, else a sole store entry.

## How it works

`dashboard.json` is the only artifact you own. `serve` hosts a prebuilt browser
runtime pointed at that file, streaming live keyless data and rendering each
frame on a CSS grid. Invalid frame configs render as per-frame error cards —
never a crashed dashboard — so a generating agent gets a tight feedback loop via
`lint`.

## Scope

- **Keyless only** — 15 free public sources: Hyperliquid (crypto + HIP-3 stock
  perps), CoinGecko, Coinpaprika, alternative.me, DeFiLlama, mempool.space,
  Deribit, the U.S. Treasury, the NY Fed, OFR, BLS, FINRA, SEC EDGAR, news RSS,
  and ECB FX rates. No keys anywhere.
- **Stocks-first** — equity perps via Hyperliquid HIP-3 builder dexes, with
  crypto, DeFi, derivatives, and official US macro data alongside.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Repository: <https://github.com/zentryHQ/zframes>
