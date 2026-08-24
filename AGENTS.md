# zframes

AI-personalizable market dashboard framework (working name — do NOT call it "hyperframes"; that's HeyGen's project, which we use as the distribution-model reference). An agent reads the frame catalogue (Zod → JSON Schema), emits a `dashboard.json` spec, and the runtime validates + renders it as a live dashboard.

## Commands

```bash
pnpm install
pnpm dev          # runtime at http://localhost:37263 (project default port, strict)
pnpm typecheck    # tsc --noEmit across all workspace packages (pnpm -r)
pnpm lint         # eslint . — also where the layer DAG is enforced (no-restricted-imports)
pnpm format       # prettier --write . (pnpm format:check is the CI gate)
pnpm build        # vite build of the runtime
pnpm build:cli    # build the zframes CLI + its prebuilt runtime bundle
pnpm zframes serve <dashboard.json>   # the runtime: serve a dashboard live (--port to change)
pnpm --filter @zframes/storybook dev  # Storybook — every frame in all variants/states at :6006
pnpm test:providers      # LIVE smoke: hit every keyless provider's real API, assert the response shape
pnpm test:frames:render  # headless-render every frame in a built Storybook, flag error cards / crashes
pnpm test:e2e            # Playwright e2e: runtime (fixture board + save round-trip) then explorer (needs Docker)
```

`pnpm test` (hermetic, stubs fetch) and `pnpm format:check` gate every PR. Test-suite
map, e2e, scheduled monitors → [tests/AGENTS.md](tests/AGENTS.md). Releasing the CLI
→ [packages/cli/AGENTS.md](packages/cli/AGENTS.md).

## Package topology

Core was decomposed into bounded-context packages (2026-07-01) and the transitional
facade is gone (2026-07-03): **every consumer imports the leaf package directly.**

| Package | Role | May import |
|---|---|---|
| `@zframes/spec` | domain kernel: types, `DashboardSpecSchema`, routes, frame/registry, presets, catalogue | nothing |
| `@zframes/data-primitives` | `fetch` + `cache` transport primitives, `csv` row parsing | spec |
| `@zframes/store` | the XDG global store (Node) | nothing |
| `@zframes/zai` | agent-orb harness (Node) | spec |
| `@zframes/account` | keyed-account HMAC relay + credentials (Node) | spec, store |
| `@zframes/serve` | spec read/write + official-data proxy (Node) | spec |
| `@zframes/vite` | the `dashboardWriteback()` dev plugin (Node, composition only) | serve, zai, account, store |
| `@zframes/core` | presentation: `DashboardRenderer`, `frame-content`, capability hooks | spec |
| `@zframes/editor` | the `DashboardEditor` authoring UI (React + GridStack) | core, spec |
| `@zframes/charts` | D3 base chart layer | nothing |
| `@zframes/unicorn` | shared Unicorn Studio scene loader + backdrop gates | nothing |
| `@zframes/frames` | the frames | charts, core, spec |
| `provider-*` (31) | React-free data adapters | spec, data-primitives |
| `@zframes/provider-demo` | the synthetic default source: seeded data for every capability, zero network | spec |
| `@zframes/providers-keyless` | composition leaf: the shipping keyless fleet | the providers, spec |
| `@zframes/plugins` | composition leaf: the built-in plugin registry (`/registry`, manifests, Node) + browser loader (`/load`, one lazy chunk per plugin) | providers-keyless, provider-demo, provider-binance, provider-wallet, spec |

ESLint `no-restricted-imports` enforces this DAG per directory, `tests/dep-dag.test.ts`
pins it at the package.json level, and `packages/core/src/barrel-surface.test.ts`
snapshot-pins the public core barrel. Node-loaded files (serve/vite/account/agent)
import siblings by **package subpath**, never relative.

**Where new code goes** (always import the leaf package):

- New spec field / frame-meta shape / theme preset / catalogue change → `packages/spec` (then the `--zf-*` mapping in core's `frame-content.tsx`/`renderer.tsx` and the editor rail if it's cosmetic).
- Provider-plugin contract (what an installed adapter declares: capabilities, hosts, credits, terms) → `packages/spec/src/provider-plugin.ts`, reached at the `@zframes/spec/provider-plugin` subpath. **Its helpers must NOT be re-exported through the spec root barrel** — core mirrors that barrel, so a value there lands on the presentation package's public API. → [packages/spec/AGENTS.md](packages/spec/AGENTS.md)
- Transport, caching or delimited-response parsing (fetch, proxy rewrite, TTL/dedup/persist, CSV rows) → `packages/data-primitives`.
- New capability hook / renderer chrome → `packages/core` (`hooks.tsx` / `frame-content.tsx`).
- Authoring-UI behaviour (palette, rail, grid interactions, default-config seeding) → `packages/editor`.
- Spec read/write or proxy route → `packages/serve`; new proxied provider host → the `hosts` list (with `proxied: true`) of the plugin manifest that fetches it — every mount derives its allowlist from the manifests it mounts (`proxyHostsOf`), so the manifest entry IS the grant.
- Store/dashboard-resolution behaviour → `packages/store`; credentials/relay → `packages/account`; orb/harness → `packages/zai`; dev-plugin composition only (no logic) → `packages/vite`.
- New frame → `packages/frames` (four lists, see `packages/frames/AGENTS.md`); new provider → a new `packages/provider-*`, added to `packages/providers-keyless/src/index.ts` (the fleet plugin constructs that factory, so no app edit) and to its manifest.
- New installable plugin (a new tier, not a fleet member) → its package exports `./manifest` (pure data) + `./plugin` (manifest + `createProviders`), then both halves of `packages/plugins` (`registry.ts` for Node, `load.ts` for the browser).

## Conventions

- pnpm only. Packages ship TypeScript source (`main: src/index.ts`); the runtime's Vite consumes them directly (`optimizeDeps.exclude`).
- `dashboard.json` is the AI-generated artifact. Invalid frame configs render as per-frame error cards (the agent's feedback loop), never crash the dashboard.
- Every frame schema field needs `.describe()` — schemas are read by generating agents via `catalogueForAI`.
- Frame chrome (cards, titles, hover) lives in the renderer's injected `.zf-*` stylesheet, themeable via `--zf-*` CSS vars; frames style only their interior.
- Base charts stay generic: no business logic, no data fetching. Frames own data, charts own rendering.
- **Every capability is denominated in USD.** A non-USD source converts on the way out; display currency is resolved by `useMoney()` in the frame, never by a provider. Footgun: the board field is an object (`currency: { code: "THB" }`) but the per-card override is a bare string (`currency: "USD"`). → [packages/core/AGENTS.md](packages/core/AGENTS.md)
- **Provider caching is centralised.** Every request/response endpoint wraps its fetch in `@zframes/data-primitives`' `TtlCache`, never a hand-rolled `memo`/`Map`/`localStorage`. Live WebSocket streams are never TTL-cached. → [packages/providers-keyless/AGENTS.md](packages/providers-keyless/AGENTS.md)
- **CORS-blocked official sources need `{ proxied: true }`**, and those frames degrade to empty on a static host with no runtime. A new proxied host is declared in the plugin manifest's `hosts` (for the fleet: `packages/providers-keyless/src/manifest.ts`); the relay itself allows nothing — every mount derives its allowlist from the manifests it mounts via `proxyHostsOf` (`tests/proxy-mounts.test.ts` pins that all four pass one). → [packages/providers-keyless/AGENTS.md](packages/providers-keyless/AGENTS.md)
- Original assets only. Deliberate exceptions (all Zentry's own IP; public release pends owner sign-off): `packages/charts` (port of zTerminal) and `packages/frames/src/use-countdown.ts` (port of zhive's `useCountdown`, the optimized global-tick/viewport-gated readout that drives the `clock` frame).
- **A pre-commit hook formats staged files** (`.githooks/pre-commit`, copied into the repo's hooks dir by `.githooks/install.mjs` on `pnpm install`). `pnpm format:check` gates every PR, so an unformatted commit reddens main on push — and with several sessions committing in parallel, the one that goes red is rarely the one that wrote the line. **No formatter is hard-coded:** the hook resolves one at run time — a `format:staged` script wins, else biome, dprint or prettier by config/dependency — so switching is a config swap, not a hook edit. Two footguns. **Never install husky:** it sets `core.hooksPath` on the repo, which overrides a *global* hooks dir, and this machine has one whose dispatcher links `.env*` into new worktrees — every fresh worktree would come up without env files. The hook is **copied, not symlinked**, because `prepare` usually runs from a worktree and a symlink would dangle when that worktree is deleted; the cost is that editing `.githooks/*` needs another `pnpm install` to take effect. Files with *unstaged* changes are skipped rather than formatted, since re-adding them would commit hunks the author left out of the index.
- **`@zframes/zai` spawns the user's own CLI** (`claude -p` / `codex exec`) inheriting the server env. `ZFRAMES_CLAUDE_CONFIG_DIR` / `ZFRAMES_CODEX_HOME` point **only** zframes's child at a specific account (config/creds dir), so they are safe to export globally and never hijack a bare `claude`/`codex` (`resolveAgentEnv`). Do not reach for `CLAUDE_CONFIG_DIR`/`CODEX_HOME` instead: those would.
- **`docs/` is gitignored** (local-only; only `docs/assets/` is tracked). Never move agent-instruction content there: a fresh clone or `git worktree` would not have it. Repo-shipped detail belongs in a child `AGENTS.md`.

## Scope

- **Data providers are operator-installed plugins.** The runtime imports no provider: it asks its server which plugins the installation mounts (`/__zframes/providers`) and loads exactly those, each as its own lazy chunk (`@zframes/plugins`). Under `zframes serve` the set is `zframes providers add/remove` (persisted in the store config); under in-repo `pnpm dev` it is the host composition in `apps/runtime/vite.config.ts` (fleet + keyed tier, so frame development sees live data). Every mount's relay allowlist derives from the mounted manifests. (NOTE: this changes published-CLI behaviour at the next npm release — a bare install then renders demo data until the operator runs `zframes providers add keyless`.)
- Keyless remains the flagship tier — all 29 market-data providers in `packages/providers-keyless` are keyless (free public APIs, no key required), one `zframes providers add keyless` away. The keyed/account tier (`provider-binance`, `provider-wallet`) is installable the same way. (32 provider packages total: 29 keyless + 2 keyed + `provider-demo`; the keyless set is composed in one place, `packages/providers-keyless` — trust that file over any count written here.)
- **`@zframes/provider-demo` is not a data source, it is the synthetic one.** It answers every capability with deterministic seeded data and touches no network. It is what the frame smoke suites, Storybook and every explorer surface run on, and **the bare-install default**: an installation with no plugins mounts it (and only it), the header badges "demo data", and `serve` says so at startup. The moment any real plugin is installed it drops out — simulated numbers never silently backfill a chosen composition. It must never be added to `packages/providers-keyless`: that list is the *live* fleet, and `tests/dep-dag.test.ts` + `tests/capability-coverage.test.ts` both read it as such.
- Stocks-first — equity perps via Hyperliquid HIP-3 builder dexes (`dex` param, e.g. `xyz:TSLA`), with crypto alongside.

## Deeper docs

Each is self-contained; read the one for the directory you are working in.

| Doc | Covers |
|---|---|
| [packages/spec/AGENTS.md](packages/spec/AGENTS.md) | the kernel: event markers, nested frame groups, the route contract |
| [packages/core/AGENTS.md](packages/core/AGENTS.md) | renderer, frame chrome, capability hooks, the full display-currency rule |
| [packages/frames/AGENTS.md](packages/frames/AGENTS.md) | adding a frame (four lists), size envelopes, the shared primitives, frame footguns |
| [packages/providers-keyless/AGENTS.md](packages/providers-keyless/AGENTS.md) | the 29-provider keyless fleet with per-provider footguns, caching, the proxy, `source` pinning |
| [packages/editor/AGENTS.md](packages/editor/AGENTS.md) | the authoring UI, default-config seeding, nested GridStack |
| [packages/charts/AGENTS.md](packages/charts/AGENTS.md) | the D3 base chart layer |
| [packages/cli/AGENTS.md](packages/cli/AGENTS.md) | CLI commands, the XDG global store, releasing |
| [apps/runtime/AGENTS.md](apps/runtime/AGENTS.md) | the runtime host, ticker tape, dashboard chooser, background |
| [apps/storybook/AGENTS.md](apps/storybook/AGENTS.md) | the six auto-generated stories per frame |
| [apps/explorer/AGENTS.md](apps/explorer/AGENTS.md) | the public front door. **Read it before touching explorer**: dev DB setup, versioned migrations (never `drizzle-kit push`), mock-data-only posture, and `next build` is NOT in CI |
| [tests/AGENTS.md](tests/AGENTS.md) | the cross-cutting invariant suites, e2e, scheduled monitors |
| `skills/zframes/SKILL.md` | the board-authoring skill (already progressively disclosed into `references/`) |

`patches/liveline@0.0.7.patch` is vendored from zhive (DPR fix + label precision),
applied via pnpm `patchedDependencies`.

Architecture decisions, the distribution model, and roadmap live in `docs/decisions/` (kept locally, not in the public repo).
