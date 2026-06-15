# zframes

> Working name. The reference model is [HeyGen's HyperFrames](https://github.com/heygen-com/hyperframes) — open framework + agent skills + component catalog — applied to personal market dashboards instead of video.

**Describe your dashboard. An agent builds it. It stays alive.**

zframes is a framework where AI agents generate personal market terminals: the agent reads a catalogue of *frames* (typed, validated dashboard components), emits a plain-JSON `dashboard.json` spec, and the runtime renders it with live market data. Invalid specs fail per-frame with readable errors the agent uses to self-correct — the generation loop is built into the rendering contract.

## Quickstart

```bash
pnpm install
pnpm dev       # http://localhost:5179 — live price charts + watchlist, no API key needed
```

The playground streams real prices from Hyperliquid's free public WebSocket — no signup, no key.

## Concepts

- **Frame** — `defineFrame({ name, description, capabilities, schema, component })`. The Zod schema (every field `.describe()`d) doubles as the AI-facing API: `catalogueForAI(registry)` exports it as JSON Schema for generating agents.
- **Dashboard spec** — `dashboard.json`: version, title, grid, frame instances with positions and configs. Diffable, git-friendly, agent-writable.
- **Provider** — fulfills frame capabilities (`quote-stream`, `day-stats`, …). Ships with Hyperliquid (free, no key). zData, stock adapters, and namespaced symbols (`crypto:BTC` / `equity:NVDA`) are on the roadmap.
- **Demo frames** — `price-chart` (live candles/line via liveline) and `price-ticker` (a streaming watchlist with 24h change).

## Status

Day-one scaffold. License TBD (Apache 2.0 intended, pending approval) — not yet published.
