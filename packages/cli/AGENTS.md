# zframes (CLI)

**The CLI is the only published artifact.** Every `@zframes/*` package stays
`private` and is inlined via tsup `noExternal`, so a missing dependency here
surfaces as a broken published binary, not a local error.

## Commands and the global store

`zframes init | serve | list | use | providers | catalogue | lint | snapshot` (tsup-bundled bin that ALSO ships a **prebuilt runtime bundle** — a `vite build` of `apps/runtime` vendored by `scripts/build-runtime.mjs` on `pnpm build:cli`, gitignored under `runtime/`). **Global store:** dashboards live in `$XDG_CONFIG_HOME/zframes` (default `~/.config/zframes`) — one **folder per dashboard** (`dashboards/<name>/dashboard.json` + its own siblings: local images, any JSON a frame reads), plus a root `config.json` (`{default, providers}`) and `credentials.json` (machine-scoped, never inside a dashboard folder) — so the CLI runs from anywhere, holds many, and each dashboard's assets stay isolated. (Legacy flat `dashboards/<name>.json` still resolves on read via `findDashboardFile`.) A bare token (`crypto`) is a store **name**; any arg with a `/` or a `.json` suffix is a **path** (fully back-compat). The path/name resolver (`classifyTarget`), store ops, and the global-default-first `serve` resolution (`resolveServeTarget`) all live in `@zframes/store` (Node-only). `init` writes a bare, schema-valid `dashboard.json` (the fixed package.json-style envelope — `version` semver string, `title`, `author`, then `grid` geometry, unicorn `background`, accent `theme`, card-surface `appearance`, empty `frames`) so the agent fills only `frames`, never hand-authoring boilerplate; a bare-name `init` lands in the store and becomes the default if none is set yet (`--default` to force; `--title`/`--author`; refuses to clobber unless `--force`); `serve` is the runtime (node:http on 127.0.0.1:37263 serving the bundle + the dashboard + a writeback PUT) and with no arg resolves **global-default-first** (config default → cwd `./dashboard.json` → sole store entry); `list`/`use` show/set the default; `lint` is the generating agent's feedback loop; `snapshot` prints a keyless market snapshot of the dashboard's symbols as JSON, for scripting and analysis (resolves global-default-first like `serve` — a bare `snapshot` reads the default — and emits a `dashboard` block with a per-dashboard `logPath` a caller may append its own analysis log to, so two dashboards never collide on one shared file). **In-app dashboard switcher:** when `serve` hosts a *store* dashboard it answers `/__zframes/dashboards` (GET list) + `/__zframes/switch` (POST re-points the mutable current-file pointer the read/write/ask routes follow), and the runtime header opens an on-demand card chooser to switch + reload (the default still always opens first) — CLI-only (absent under `vite dev`; an explicit-path serve reports `canSwitch:false`, where switching stays off). Keyed-account credentials also moved to the XDG home (`credentials.json`, in the `0700` store home). **The CLI is the only published artifact** (the `@zframes/*` packages stay `private`, inlined via tsup `noExternal`).

## Data-provider plugins

`zframes providers [list|add <id>|remove <id>]` manages the installed
data-provider plugins (ids from `@zframes/plugins`' registry: `keyless`,
`binance`, `wallet`, `demo`), persisted as `providers` in the store
`config.json` in **mount order — earlier wins capability routing**. `add`
prints the install-time notice (every host the plugin contacts, relay grants
marked, and where its terms live). `serve` resolves the installed set once at
startup: it answers `/__zframes/providers` (what the app loads, each plugin its
own lazy chunk in the prebuilt bundle), derives the relay allowlist from the
mounted manifests (`proxyHostsOf` — nothing installed relays nothing), and
prints both at startup so consent stays visible. **A bare install mounts the
synthetic `demo` plugin** — the board renders, the header badges "demo data",
and `providers add keyless` is the one-liner to live data.

## The agent skill

the agent skill: resolve CLI (`npx zframes`) → `init <name>` a bare `dashboard.json` into the global store (or a path) → browse `catalogue --summary` → interview → design (apply ONE theme preset, curate 20–35 frames into headed zones, sizes from each frame's `layout`) → fetch the picked frames' schemas (`catalogue <frame...>`) → lint → `zframes serve <name>` → visual sweep (npx-only; no scaffold). Progressive disclosure: SKILL.md routes serve/update/create/fork; the interview funnel + xyz symbol table, the design method, and the fork flow live in `skills/zframes/references/`.

## Releasing

Bump `packages/cli/package.json` version, commit, then
`git tag v<version> && git push origin v<version>`. `release.yml` verifies,
builds, and npm-publishes via trusted publishing (OIDC + provenance, no token).
