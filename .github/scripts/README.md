# Scheduled monitors (`.github/scripts`)

The hermetic vitest suite (`pnpm test`) stubs `fetch`, runs offline, and gates
every PR. It can't tell you a free API died overnight, that the published CLI is
broken, that a frame started crashing, or that a dependency CVE landed. The
monitors here do — they run on a cron, hit the real world, and (the repo being
public) **file a GitHub issue** instead of turning a PR red.

| Monitor | Catches | Determinism | Workflow | Cadence | Issue label |
|---|---|---|---|---|---|
| **Provider** | a keyless API died / changed shape / rate-limited | flaky (external) | `provider-monitor.yml` | daily | `provider-drift` |
| **CLI smoke** | the published `npx zframes` is broken/stale | semi | `cli-smoke.yml` | daily · 3 OSes | `cli-broken`(`-macos`/`-windows`) |
| **Frame render** | a frame renders an error card / crashes | **deterministic** | `frame-render.yml` | nightly | `frame-render` |
| **FX coverage** | a board currency lost its FX fallback / a source died | semi (external) | `fx-coverage.yml` | weekly | `fx-coverage` |
| **Dep audit** | a HIGH/CRITICAL advisory in deps | deterministic | `audit.yml` | weekly | `security-audit` |
| **Dashboard validity** | a STORED dashboard stopped validating (renamed frame / config field) | deterministic | `dashboard-validity.yml` | nightly | `dashboard-validity` |

All are dispatch-able on demand from the Actions tab. Issue dedup is uniform:
**one open issue per label** — comment while a problem persists, **auto-close on
recovery** (`report-to-issue.mjs`). Dependency upgrade PRs come from Dependabot
(`.github/dependabot.yml`); the audit monitor is the "something serious" alarm.

## Provider · `provider-smoke.ts` · `pnpm test:providers`

Probes every keyless provider's LIVE API and asserts the response still has the
shape the provider expects (an object or an array, per entry). Driven off `@zframes/providers-keyless` (the exact set
the apps ship) so a new provider is covered automatically; a provider with no
probe is flagged (`warn`) to keep the manifest in lockstep. A **throw = hard
signal** (dead endpoint / non-2xx / schema drift) → `fail` → issue; empty-but-
valid is a soft `warn`. No AI, no cost, no key.

**SEC:** `data.sec.gov` 403s a UA without a contact **email** — set repo variable
`ZFRAMES_CONTACT` to enable the SEC probes; unset, they skip (warn), never fail.

**Three optional per-probe knobs**, each earned by a live failure mode rather than
added speculatively:

- `pick` — grade a named property instead of the whole result. Envelope returns
  (`{series: […], level, source}`) always have keys, so an all-miss region lookup
  would grade `ok`; picking `series`/`entries` makes an empty payload warn.
- `timeoutMs` — per-probe timeout. The bulk-CSV housing sources (Zillow ~4.4 MB,
  FHFA metro ~4 MB) exceed the 25s default, and the providers already pass their
  own 30s abort, so the harness must not cut in first.
- `slowSource` — a **timeout** on this probe warns instead of failing. FHFA's
  metro file serves in ~6s in isolation but stalls past 30s under repeat load
  (confirmed live); that transient must not file an issue. Any non-timeout error
  on the same probe — dead URL, non-2xx, parse drift — still fails hard.

## CLI smoke · `cli-smoke.mjs` · (workflow installs `zframes@latest`)

Drives the **published** package end to end: init → lint → serve → HTTP-fetch the
served app, the dashboard spec, and the referenced JS bundle (catches a
missing/stale prebuilt runtime bundle — a real past failure mode). Plain node —
tests the registry artifact, not our source. Runs on a linux/macos/windows
matrix (users npx from all three); each OS keeps its own issue label so one
platform's breakage never closes another's.

## Frame render · `frame-render-smoke.ts` · `pnpm test:frames:render`

Builds Storybook and headless-renders every frame's `Default` story through the
real renderer + offline mock, flagging any that show the shared error card
(`.zf-error` = unknown-frame / missing-capability / invalid-config / crash) or
throw. Deterministic and credential-free — the reliable "is a frame broken?"
check. (An AI vision reviewer for *subjective* "looks bad" was prototyped and
removed: it needs a metered API key — a subscription OAuth token 429s the batch
Messages-API path. A pixel-diff for subtle layout regressions is a possible
future add-on.)

## Frame size envelope · `frame-size-*.ts` · `pnpm frames:size:*`

On-demand, not scheduled — this is the toolchain behind every frame's
`layout: { w, h, minW, minH, maxW?, maxH? }`, run when frames or their bounds
change rather than nightly.

```bash
pnpm --filter @zframes/storybook build   # all five stages read storybook-static/
pnpm frames:meta                         # frame-meta.json — identity + current layout
pnpm frames:size:probe                   # frame-size-probe.json — the 12x8 measurement matrix
pnpm frames:size:derive                  # frame-size-bounds.json — recommended bounds + evidence
EXPLAIN=<frame> pnpm frames:size:explain # one frame's matrix, metric by metric
pnpm frames:size:sheet                   # frame-size-sheets/<frame>.png — the envelope's corners
APPLY_DRY=1 pnpm frames:size:apply       # rewrite schemas.ts layout lines (drop APPLY_DRY to write)
```

**probe** mounts each frame's `Default` story ONCE and resizes it through all 96
spans by rewriting `--zf-col-span`/`--zf-row-span` — the same vars the renderer
places cards with, so a chart re-measures through its ResizeObserver exactly as
it does when a user drags a handle. Per span it records content clipped by an
`overflow:hidden` ancestor, labels actually hitting their ellipsis, the main
chart's box, how many rows a scroll list shows, and `inkN`/`inkW`/`inkH` — how
much the frame chose to render and what fraction of the card paints.

**derive** reads that as: the floor is the largest rectangle of spans that is
clean throughout (faults present even at 12×8 are frame bugs, not sizing, so
they are excluded and reported as `inherent:*`); the ceiling is where ink stops
covering the card. Bounds are never allowed to invalidate a shipped board.

**sheet** exists because the ceiling is an aesthetic judgement no metric settles
— nothing breaks when a card grows, it just stops being worth its space.

Env: `PROBE_FRAMES` / `SHEET_FRAMES` (comma list, one frame or a few),
`PROBE_RESUME=1` (keep prior results; with `PROBE_FRAMES` it becomes a targeted
re-measure merged into the existing matrix), `PROBE_CONCURRENCY` (default 4 —
each worker owns a browser and replaces it on a crash, which does happen over a
sweep this long).

## FX coverage · `fx-coverage.mjs`

`CURRENCY_CODES` (`packages/spec/src/spec.ts`) is **derived data**: a code is a
selectable board display currency only when **≥2** of `provider-fx`'s four
keyless upstreams (Frankfurter/ECB → FXRatesAPI → currency-api → ECB Data Portal
direct) quote it, so every board currency inherits the chain's fallback
resilience. Upstream coverage drifts — a source drops a currency, tightens its
keyless tier, or vanishes (`exchangerate.host` went key-gated,
`exchangerate-api.com/v4` was deprecated) — and **the provider monitor cannot
see it**: it probes `getFxRates`, which walks the chain and passes while *any*
link answers, so a dead **fallback** is invisible to it by construction.

This monitor fetches each source's live coverage, recomputes the ≥2-source set,
and diffs it against the committed enum. Three findings, by severity:

1. 🔴 **a source unreachable / changed shape** — the chain silently lost a link
   (non-JSON body, 401/403, `success:false`)
2. 🔴 **enum code with 0 sources** — the board renders an unconverted USD figure
   wearing the wrong symbol
3. 🟠 **enum code down to 1 source** — correct today, no resilience left

Codes that *newly* qualify are reported as an informational `<details>` block
only, never a finding (the two broad sources also list crypto and defunct/
redenominated codes — `NON_CURRENCY` filters the assets, human judgment does the
rest).

Not crying wolf on a blip, in three layers: each source is tried **3×** with
growing pauses; if **any** source failed the coverage diff is **skipped**
entirely (recomputing from the survivors would report half the enum as having
lost its fallback); and the shared dedup means a blip that beats both costs one
self-closing issue, not one per run. The enum is **parsed out of `spec.ts`** (not
duplicated here, and no assumption about its length) — plain node, so the
workflow needs no `pnpm install` and no build.

`FX_COVERAGE_BREAK=frankfurter node .github/scripts/fx-coverage.mjs` points one
source at a dead host to exercise the outage path.

## Dependency audit · `audit-report.mjs`

Runs `pnpm audit`; opens an issue on HIGH/CRITICAL advisories (moderate/low are
left to Dependabot's weekly PRs).

## Dashboard validity · `apps/explorer/scripts/validate-dashboards.ts`

`pnpm --dir apps/explorer validate:dashboards` — re-runs `validateDashboardSpec`
over every non-removed row in the `dashboards` table.

This one exists because of a trade. The curated showcase used to be TypeScript
(`apps/explorer/app/lib/curated-dashboards.ts`) and `tests/curated-specs.test.tsx`
validated it in CI, so a frame rename **failed the build**. The showcase moved into
the database on 2026-08-05 (boards editable without a deploy) and a jsonb column
cannot fail a typecheck. `validateDashboardSpec` gates every write, so nothing
enters the table broken — what it cannot see is a board that was valid when written
and went stale when the registry moved under it: a renamed frame, a dropped
`lazy.ts` loader, a renamed config field, a tightened enum. That is the common
case, and this is the net under it.

Needs `DATABASE_URL` (the prod Neon pooled URL, shared with the thumbnail cron);
skips cleanly when unset. Locally it defaults to the Docker dev database, so with
`pnpm --dir apps/explorer db:up` running, a bare
`pnpm --dir apps/explorer validate:dashboards` just works.

An **empty table is a finding**, not a pass — it means the showcase is missing and
nothing else would say so.

## Shared · `report-to-issue.mjs`

`node .github/scripts/report-to-issue.mjs --kind <provider|generic> --label <label> --report <path.json>`

Reads a monitor's JSON report and does the open / comment / close dance via `gh`
(auth: `GH_TOKEN`; needs `issues: write`). `provider` renders the provider table;
`generic` takes a pre-rendered `{title, body, findingsCount}` (used by CLI smoke,
frame render, and audit) so a new monitor needs no branch here.

## Not a monitor: `release.yml`

Tag-triggered npm publish of the CLI (the only published artifact). Push
`v<version>` matching `packages/cli/package.json` → verify → typecheck/test →
`pnpm pack` (prepack builds the runtime bundle; workspace deps rewritten) →
`npm publish` via **trusted publishing** (OIDC + provenance, no stored token).
Requires the one-time trusted-publisher link on npmjs.com (see the workflow
header).

## Not a monitor: `db-deploy.yml` · `wait-for-deployment.mjs`

Applies pending SQL migrations to production, and re-seeds the curated showcase
only when `apps/explorer/scripts/curated-seed.json` changed. Runs on pushes to
`main` that touch the schema, the migrations, or the seed.

The ordering is the interesting part, because Vercel builds on the same push in
parallel and cannot be sequenced from here:

- **Migrations run immediately**, without waiting. Files in
  `apps/explorer/drizzle/` are required to be additive or constraint-relaxing, so
  the *previous* release keeps serving correctly while they apply. That rule is what
  removes the need for a cutover.
- **The seed waits** for the Vercel Production deployment of that exact SHA, via
  `wait-for-deployment.mjs` (polls the GitHub deployments API — no Vercel token).
  A seeded board can reference a frame the release introduced; seeding early puts
  "Unknown frame" cards on the front page. Timeout or a failed deploy fails the step
  and leaves the database alone, which is the safe direction.

Re-seeding **overwrites** DB edits to the boards in the seed file, which is why it
is gated rather than run on every push — see `apps/explorer/AGENTS.md`.

Secret: `DATABASE_URL_UNPOOLED` — Neon's direct endpoint, not the pooled
`DATABASE_URL` the read-only crons use. This job runs DDL, and migrations take an
advisory lock inside a multi-statement transaction, which belongs off the pooler.

## Enabling in a fork

All the monitors need `issues: write` (declared in each). No secrets required.
Set repo variable `ZFRAMES_CONTACT` (an email) to additionally cover the SEC
provider. `db-deploy.yml` additionally needs a database URL secret and skips
cleanly without one.
