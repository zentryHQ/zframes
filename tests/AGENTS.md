# Cross-cutting tests

`pnpm test` is hermetic (stubs fetch) and gates every PR, as does
`pnpm format:check`. The suites in this directory police the seams that the
package-level layer DAG cannot.

| Suite | What it pins |
|---|---|
| `dep-dag.test.ts` | which `@zframes` deps each package may declare; a new edge must be a conscious edit |
| `capability-coverage.test.ts` | every declared capability is served and consumed |
| `currency-coverage.test.ts` | derives exemptions from each frame's `usdOnly` meta; fails if any other frame touches `formatPrice`/`formatCompactUsd` |
| `chart-events-coverage.test.ts` | a frame drawing markers renders `TimeSeriesChart` AND sets `annotatable` |
| `frame-layout-bounds.test.ts` | `1 ≤ min ≤ default ≤ max`, and no shipped board sits outside its frames' bounds |
| `schema-describe-coverage.test.ts` | every frame schema field carries `.describe()` |
| `symbol-control-coverage.test.ts` | symbol fields expose the right editor control |
| `golden-specs.test.tsx` | reference boards still render |
| `proxy-mounts.test.ts` | every in-repo `handleProxy` mount names its allowed hosts (the relay allows nothing by default, and a mount that forgets refuses every upstream as an empty card) |
| `keyless-proxy-hosts.test.ts` | the keyless plugin manifest's proxied hosts equal serve's `PROXY_ALLOW_HOSTS`, both directions |
| `keyless-source-credits.test.ts` | that manifest's credits equal the frame catalogue's `SOURCES`, ids and display names alike |

## e2e, monitors, and release

`pnpm test` is hermetic (stubs fetch) and gates every PR. **Playwright e2e suites** live in `apps/runtime/e2e/` (vite dev serving a temp copy of a fixture board — render assertions + the editor's Save→dashboard.json round-trip; `ZFRAMES_DASHBOARD_FILE` is the vite-config override that points the dev plugin at it) and `apps/explorer/e2e/` (throwaway Postgres on :5434 via `e2e/docker-compose.e2e.yml` → migrate → seed, `next dev` on :43264 — landing/gallery/catalogue/board/embed on demo data); both drive the system Chrome locally (`PLAYWRIGHT_CHANNEL` overrides) and run in CI via `e2e.yml`. Alongside it, a **scheduled-monitor suite** runs on crons and files GitHub issues instead of gating PRs: provider liveness, published-CLI smoke (linux/macos/windows), frame-render, and a `pnpm audit` (+ Dependabot). See `.github/scripts/README.md`. **Releasing the CLI:** bump `packages/cli/package.json` version, commit, then `git tag v<version> && git push origin v<version>` — `release.yml` verifies, builds, and npm-publishes via trusted publishing (OIDC + provenance; no token). CodeQL (default setup) and secret-scanning push protection run repo-side.
