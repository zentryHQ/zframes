# zframes

> Working name. The reference model is [HeyGen's HyperFrames](https://github.com/heygen-com/hyperframes) — open framework + agent skill + component catalogue — applied to personal market dashboards instead of video.

**Describe your dashboard. An agent builds it. It stays alive.**

zframes is a framework where AI agents generate personal market terminals: the agent reads a catalogue of *frames* (typed, validated dashboard components), emits a plain-JSON `dashboard.json` spec, and the runtime renders it with live market data. Invalid specs fail per-frame with readable errors the agent uses to self-correct — the generation loop is built into the rendering contract.

Everything runs **keyless** — Hyperliquid, DeFiLlama, alternative.me, and CoinGecko free public APIs. No signup, no API keys.

## Quickstart

```bash
pnpm install
pnpm dev          # playground at http://localhost:5179
```

The playground streams real prices from Hyperliquid's public WebSocket and renders the dashboard in [`apps/playground/src/dashboard.json`](apps/playground/src/dashboard.json). Edit that file (by hand or with the agent) and it hot-reloads.

```bash
pnpm typecheck    # tsc across all packages
pnpm build        # production build of the playground
```

## The agent flow

A human installs the skill once, then just talks; their agent does the rest:

```
"build me a BTC + TSLA terminal"
  → agent reads the frame catalogue
  → agent writes dashboard.json and lints it
  → agent runs the app, opens the browser
```

The agent never writes React — only JSON. The contract is the catalogue (frame names, config schemas) and the linter (per-frame validation feedback). The skill that drives this lives in [`skills/zframes/SKILL.md`](skills/zframes/SKILL.md).

## Concepts

- **Frame** — `defineFrame({ name, description, capabilities, schema, component })`. The Zod schema (every field `.describe()`d) doubles as the AI-facing API: `catalogueForAI(registry)` exports it as JSON Schema for generating agents. Frame *metadata* (`packages/frames/src/schemas.ts`) is React-free, so tooling reads it without pulling in charts or CSS.
- **Dashboard spec** — `dashboard.json`: version, title, grid, background, and frame instances with positions and configs. Diffable, git-friendly, agent-writable.
- **Provider** — fulfills frame *capabilities* (`quote-stream`, `day-stats`, `ohlcv`, `tvl`, `sentiment`, `global-market`, …). The host registers providers; the runtime routes each frame's data needs to the first provider that covers them. A frame whose capability no provider covers renders as an error card, never a silently-empty widget.
- **Background** — the spec *declares* the background (`gradient` | `unicorn` | `none`); the host *renders* it. Same split as providers, keeping the heavy animated engine out of the spec and the React-free tooling path.

## Frame catalogue

Twelve built-in frames (`packages/frames`):

| Frame | What it shows |
|---|---|
| `price-chart` | Live candle/line chart for one symbol (liveline), crypto + HIP-3 stock perps |
| `price-ticker` | Streaming watchlist with 24h change |
| `top-movers` | Biggest gainers/losers across the perp universe |
| `funding-rate-chart` | Multi-series funding rates across coins |
| `funding-heatmap` | Funding rates as a coins × time heatmap |
| `tvl-treemap` | Total value locked per chain (DeFiLlama) |
| `fear-greed` | Crypto Fear & Greed index with sparkline |
| `bitcoin-dominance` | BTC / ETH / Others dominance bar |
| `note` | Free-form pinned text (trading plan, reminders) |
| `image` | Image from a URL |
| `heading` | Section divider to group frames into zones |
| `dino-game` | Chrome-dino runner, for when the market's flat |

Stocks work via Hyperliquid HIP-3 builder dexes, namespaced by Hyperliquid itself (`xyz:TSLA`, `km:US500`) — the same free WebSocket, no extra adapter.

## Providers

All free, all keyless (`packages/provider-*`):

- **Hyperliquid** — `quote-stream`, `day-stats`, `funding-history`, `ohlcv` (crypto + HIP-3 stock perps)
- **DeFiLlama** — `tvl`
- **alternative.me** — `sentiment` (Fear & Greed)
- **CoinGecko** (free tier) — `global-market` (total marketcap + dominance)

## CLI

```bash
pnpm build:cli                      # build the bin (also vendors the scaffold template)
pnpm zframes catalogue              # frame catalogue as JSON Schema (what the agent reads)
pnpm zframes lint <dashboard.json>  # validate a spec; exit 1 with readable, per-frame errors
pnpm zframes init [dir]             # scaffold a full, runnable dashboard app
pnpm zframes init --json [file]     # write just a starter dashboard.json
```

`zframes init` scaffolds a complete, owned Vite app with the runtime vendored in — it runs without cloning this repo or installing anything from a registry. (Publishing the CLI and skill to npm is on the roadmap; see `docs/deployment-plan.html`.)

## Packages

```
packages/
  core                     frame primitives, spec schema, renderer, provider hooks, catalogue
  charts                   D3 base chart layer (ported from zTerminal) + theme tokens
  frames                   the 12 built-in frames + their AI-facing schemas
  provider-hyperliquid     keyless live market data (crypto + HIP-3 stocks)
  provider-defillama       TVL
  provider-alternativeme   Fear & Greed
  provider-coingecko       global market / dominance
  cli                      zframes catalogue | lint | init
apps/playground            Vite demo that renders src/dashboard.json
skills/zframes             the agent skill
```

## License

[Apache-2.0](LICENSE). The runtime packages are not yet published to npm — distribution today is the `zframes init` scaffold (see `docs/deployment-plan.html`).
