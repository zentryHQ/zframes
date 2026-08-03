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

## Enabling in a fork

All workflows need `issues: write` (declared in each). No secrets required.
Set repo variable `ZFRAMES_CONTACT` (an email) to additionally cover the SEC
provider.
