# Scheduled monitors (`.github/scripts`)

The hermetic vitest suite (`pnpm test`) stubs `fetch`, runs offline, and gates
every PR. It can't tell you a free API died overnight, that the published CLI is
broken, that a frame started crashing, or that a dependency CVE landed. The
monitors here do — they run on a cron, hit the real world, and (the repo being
public) **file a GitHub issue** instead of turning a PR red.

| Monitor | Catches | Determinism | Workflow | Cadence | Issue label |
|---|---|---|---|---|---|
| **Provider** | a keyless API died / changed shape / rate-limited | flaky (external) | `provider-monitor.yml` | daily | `provider-drift` |
| **CLI smoke** | the published `npx zframes` is broken/stale | semi | `cli-smoke.yml` | daily | `cli-broken` |
| **Frame render** | a frame renders an error card / crashes | **deterministic** | `frame-render.yml` | nightly | `frame-render` |
| **Dep audit** | a HIGH/CRITICAL advisory in deps | deterministic | `audit.yml` | weekly | `security-audit` |

All are dispatch-able on demand from the Actions tab. Issue dedup is uniform:
**one open issue per label** — comment while a problem persists, **auto-close on
recovery** (`report-to-issue.mjs`). Dependency upgrade PRs come from Dependabot
(`.github/dependabot.yml`); the audit monitor is the "something serious" alarm.

## Provider · `provider-smoke.ts` · `pnpm test:providers`

Probes every keyless provider's LIVE API and validates the response against the
provider's own Zod schema. Driven off `@zframes/providers-keyless` (the exact set
the apps ship) so a new provider is covered automatically; a provider with no
probe is flagged (`warn`) to keep the manifest in lockstep. A **throw = hard
signal** (dead endpoint / non-2xx / schema drift) → `fail` → issue; empty-but-
valid is a soft `warn`. No AI, no cost, no key.

**SEC:** `data.sec.gov` 403s a UA without a contact **email** — set repo variable
`ZFRAMES_CONTACT` to enable the SEC probes; unset, they skip (warn), never fail.

## CLI smoke · `cli-smoke.mjs` · (workflow installs `zframes@latest`)

Drives the **published** package end to end: init → lint → serve → HTTP-fetch the
served app, the dashboard spec, and the referenced JS bundle (catches a
missing/stale prebuilt runtime bundle — a real past failure mode). Plain node —
tests the registry artifact, not our source.

## Frame render · `frame-render-smoke.ts` · `pnpm test:frames:render`

Builds Storybook and headless-renders every frame's `Default` story through the
real renderer + offline mock, flagging any that show the shared error card
(`.zf-error` = unknown-frame / missing-capability / invalid-config / crash) or
throw. Deterministic and credential-free — the reliable "is a frame broken?"
check. (An AI vision reviewer for *subjective* "looks bad" was prototyped and
removed: it needs a metered API key — a subscription OAuth token 429s the batch
Messages-API path. A pixel-diff for subtle layout regressions is a possible
future add-on.)

## Dependency audit · `audit-report.mjs`

Runs `pnpm audit`; opens an issue on HIGH/CRITICAL advisories (moderate/low are
left to Dependabot's weekly PRs).

## Shared · `report-to-issue.mjs`

`node .github/scripts/report-to-issue.mjs --kind <provider|generic> --label <label> --report <path.json>`

Reads a monitor's JSON report and does the open / comment / close dance via `gh`
(auth: `GH_TOKEN`; needs `issues: write`). `provider` renders the provider table;
`generic` takes a pre-rendered `{title, body, findingsCount}` (used by CLI smoke,
frame render, and audit) so a new monitor needs no branch here.

## Enabling in a fork

All workflows need `issues: write` (declared in each). No secrets required.
Set repo variable `ZFRAMES_CONTACT` (an email) to additionally cover the SEC
provider.
