# Scheduled monitors (`.github/scripts`)

The hermetic vitest suite (`pnpm test`) stubs `fetch` and runs offline — it verifies
our code, and gates every PR. It **cannot** tell you that a free public API died
overnight. That's what the scheduled monitor here does: it runs on a cron, hits the
real world, and — because the repo is public — **files a GitHub issue** instead of
turning a PR red.

| Layer | What it catches | Determinism | Where | Trigger | On failure |
|---|---|---|---|---|---|
| `pnpm test` (existing CI) | our logic — type/lint/unit/build | deterministic | `ci.yml` | PR + push | blocks merge |
| **Provider monitor** | a keyless API died / changed shape / rate-limited | flaky (external) | `provider-monitor.yml` | cron daily + dispatch | opens/updates issue `provider-drift` |

Issue dedup: **one open issue per label.** The monitor comments a fresh timeline
entry while a problem persists and **auto-closes the issue when it recovers** —
never a new issue per run.

> A deterministic Storybook pixel-diff (per-PR visual-regression) is a natural
> next layer if visual coverage is wanted — it needs no credentials. An AI
> frame-vision reviewer was prototyped and removed: it needs a metered API key to
> run cleanly (a subscription OAuth token 429s the batch Messages-API path), which
> wasn't wanted here.

## Provider monitor · `provider-smoke.ts`

```bash
pnpm test:providers                       # probe every keyless provider's live API
SMOKE_ONLY=coingecko,fx pnpm test:providers   # subset by package-name substring
ZFRAMES_CONTACT=you@example.com pnpm test:providers   # also probe SEC (see below)
```

Drives off `@zframes/providers-keyless` — the exact set the published apps ship —
so a new keyless provider is smoke-tested automatically; a provider in the set
with no probe row is flagged (`warn`) to keep the manifest (`PROBES`) in lockstep.
Each probe calls a capability method against the live endpoint; providers already
`fetchJson(url, schema)`, so a **throw is the hard signal** (dead endpoint /
non-2xx / schema drift) → `fail` → issue. An empty/odd-but-non-throwing result is
a **soft `warn`** (free APIs legitimately return empty on a lag) — surfaced in the
report, never issue-worthy on its own. Proxied providers (treasury/ofr/finra/sec/
news) work here because `proxied:true` is a no-op in Node.

**SEC:** `data.sec.gov`'s fair-access policy 403s a User-Agent without a contact
**email**. Set repo variable `ZFRAMES_CONTACT` to an email to enable the SEC probes;
unset, they're **skipped (warn), never failed** — so no email is hardcoded in a
public repo and no permanent false alarm.

## Shared · `report-to-issue.mjs`

`node .github/scripts/report-to-issue.mjs --kind provider --label provider-drift --report provider-smoke-report.json`

Reads a monitor's JSON report and does the open / comment / close dance via `gh`
(auth: `GH_TOKEN` in Actions; needs `issues: write`). The domain script owns the
data and the exit code; this owns only the issue mechanics.

## Enabling in a fork

Works out of the box — no secrets required. Set repo variable `ZFRAMES_CONTACT`
(an email) to additionally cover the SEC provider. Needs `issues: write` (declared
in the workflow's `permissions`).
