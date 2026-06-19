# my zframes terminal

A personal, live market dashboard built with [zframes](https://github.com/zentryhq/zframes).
Streams real prices from Hyperliquid, DeFiLlama, alternative.me, and CoinGecko —
all keyless, no signup, no API keys.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5179
```

> Requires [pnpm](https://pnpm.io). The dashboard hot-reloads when you edit `src/dashboard.json`.

## Change your dashboard

Your whole dashboard is one file: **`src/dashboard.json`**. It's a plain spec —
frames, positions, and configs on a 12-column grid — validated and rendered at runtime.
Invalid configs show a per-frame error card instead of crashing the page.

Two ways to edit it:

- **By hand** — open `src/dashboard.json` and tweak symbols, layout, or which frames appear.
- **With an agent** — install the `zframes` skill and just say what you want
  ("add a TSLA chart", "show funding rates"). The agent reads the frame catalogue,
  rewrites `dashboard.json`, and lints it for you.

## What's in here

- `src/dashboard.json` — your dashboard spec (the only file you normally touch)
- `src/App.tsx` — wires the renderer to the data providers
- `packages/` — the vendored zframes runtime (frames, charts, core, providers)

## License

The vendored `packages/` retain their upstream zframes license.
