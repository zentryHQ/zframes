# Scheduled monitors (`.github/scripts`)

The hermetic vitest suite (`pnpm test`) stubs `fetch` and runs offline — it verifies
our code, and gates every PR. It **cannot** tell you that a free public API died
overnight or that a frame started rendering wrong. That's what these scheduled
monitors do: they run on a cron, hit the real world, and — because the repo is
public — **file a GitHub issue** instead of turning a PR red.

| Layer | What it catches | Determinism | Where | Trigger | On failure |
|---|---|---|---|---|---|
| `pnpm test` (existing CI) | our logic — type/lint/unit/build | deterministic | `ci.yml` | PR + push | blocks merge |
| **Tier 1 — provider monitor** | a keyless API died / changed shape / rate-limited | flaky (external) | `provider-monitor.yml` | cron 2×/day + dispatch | opens/updates issue `provider-drift` |
| **Tier 3 — frame vision review** | a frame *looks* broken | subjective (AI) | `frame-vision.yml` | weekly + dispatch | opens/updates issue `frame-vision` |

> Tier 2 (Storybook pixel-diff, deterministic, per-PR) and Tier 4 (published-`npx zframes`
> smoke) are designed but not yet built — see the plan.

Issue dedup is uniform: **one open issue per label.** A monitor comments a fresh
timeline entry while a problem persists and **auto-closes the issue when it
recovers** — never a new issue per run.

## Tier 1 — provider monitor · `provider-smoke.ts`

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

## Tier 3 — frame vision review · `frame-vision-review.ts`

```bash
pnpm --filter @zframes/storybook build         # produce storybook-static/
CLAUDE_CODE_OAUTH_TOKEN=… pnpm test:frames:vision   # screenshot + vision-review every frame
VISION_MODEL=claude-haiku-4-5 VISION_MAX_FRAMES=5 …   # cheap trial pass
```

Builds Storybook (one story per frame, generated off the React-free schemas →
full set), screenshots each frame's `Default` render with playwright + system
Chrome, and asks Claude vision *"is this visually broken?"* with a structured
verdict. **Advisory:** Storybook uses the offline mock provider, so the prompt is
primed to discount known harness artifacts (grid measure-race, extent-domain
cramming, legit empty states) and findings are **leads for a human to confirm,
not verdicts**. Findings file an issue; they do **not** fail the run.

Auth: a **Claude Code OAuth token** (`CLAUDE_CODE_OAUTH_TOKEN`, from `claude
setup-token`) — the SDK sends it as a Bearer token with the `oauth-2025-04-20`
beta header; the script also accepts a plain `ANTHROPIC_API_KEY`. The workflow
reads secret `CLAUDE_CODE_OAUTH_TOKEN` and skips gracefully until it's set. Note
the OAuth token draws on your subscription quota rather than metered API billing.
Cost/quota scales with frame count × `VISION_MODEL` — default `claude-sonnet-5`;
dispatch with a small `max_frames` to trial before a full run.

## Shared · `report-to-issue.mjs`

`node .github/scripts/report-to-issue.mjs --kind <provider|vision> --label <label> --report <path.json>`

Reads a monitor's JSON report and does the open / comment / close dance via `gh`
(auth: `GH_TOKEN` in Actions; needs `issues: write`). Domain scripts own the data
and the exit code; this owns only the issue mechanics.

## Enabling in a fork

- **Tier 1** works out of the box. Set repo variable `ZFRAMES_CONTACT` (email) to
  additionally cover SEC.
- **Tier 3** needs repo secret `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`;
  or an `ANTHROPIC_API_KEY`).
- Both need `issues: write` (declared in each workflow's `permissions`).
