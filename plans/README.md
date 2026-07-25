# Animation improvement plans

Written by the `improve-animations` audit (2026-07-11, commit `4003be6`) covering the explorer site (`apps/explorer`), the runtime (`apps/runtime`), and the shared presentation packages (`packages/core`, `packages/editor`, `packages/charts`, `packages/frames`). Each plan is self-contained — an executor needs zero context beyond the plan file.

Run a plan with `improve-animations execute plans/NNN-….md`, or hand it to any agent.

## Plans

| # | Plan | Severity | Area | Status |
| --- | --- | --- | --- | --- |
| 001 | [Orb open/close GPU pass](001-orb-open-gpu-pass.md) | HIGH | runtime | BLOCKED — target orb rework withdrawn from tree by co-session; re-check when it lands |
| 002 | [Chart tooltip feel](002-chart-tooltip-feel.md) | HIGH | charts | DONE (74128c8) |
| 003 | [Explorer signature ease + motion gates](003-explorer-signature-ease-and-motion-gates.md) | MEDIUM | explorer | DONE (46cb417) |
| 004 | [Charts reduced-motion](004-charts-reduced-motion.md) | MEDIUM | charts | DONE (12f43de) |
| 005 | [Frame hover crisp-up](005-frame-hover-crisp.md) | MEDIUM | core | DONE (20ca5e2) |

Executed 2026-07-11 in worktree `anim-polish`, landed on main via `git land` (tip `12f43de`), `pnpm typecheck` green across all packages. Feel checks from each plan's Verification section are still worth a human pass.

## Recommended execution order

1. **005** — smallest diff (3 values, 1 file), immediate product-wide feel win.
2. **003** — explorer-only, no cross-plan interactions.
3. **002** — charts timing values.
4. **004** — charts reduced-motion. Run AFTER 002: both touch `create-interactions.ts`; 004's steps say how to adapt if 002's durations already landed.
5. **001** — the orb rewrite. Biggest single win but needs the careful feel-check (hit-area, rapid-toggle retargeting, WebGL scaling); do it when a human can eyeball the result. NOTE: `apps/runtime/src/zai-orb.tsx` has uncommitted working-tree changes — coordinate with whoever owns that edit before executing.

## Dependencies

- 004 depends softly on 002 (same file, `create-interactions.ts`); order 002 → 004 or adapt per 004's boundary note.
- 001, 003, 005 are fully independent of everything.

## Vetted but unplanned findings (ask for a plan if wanted)

- MEDIUM — dashboard-chooser modal + card grid pop in with no entrance (`apps/runtime/src/dashboard-chooser.tsx:122,138`); fix = fade + scale(0.97) 200ms + 40ms card stagger.
- MEDIUM — editor config rail animates `width`/`margin-left` (`packages/editor/src/editor.css:588-603`); the lockstep grid compression is documented deliberate design — only mitigation (0.32s→0.24s, containment) is on the table, not a transform rewrite.
- MEDIUM — editor frame add/delete teleport (entrance killed at `editor.css:128-131`, no exit); fix = scoped `data-entering`/exit classes.
- MEDIUM — runtime duration sprawl (0.45/0.46/0.5 and 0.2–0.34 clusters across `styles.css` + `zai-orb.tsx`); fix = `--zf-duration-*` tokens.
- LOW cluster — session-progress `transition-[width]` → scaleX; symbol-menu dropdown no entrance (`editor.css:1410`); editor dialog reduced-motion over-nuke (`editor.css:1856` — should keep the fade); explorer `.zf-press` gaps (PublishDialog, mine/delete, CopyRow has no transition at all); `interactiveSurface` missing `:active` press (`packages/frames/src/content-shared.ts:8` — one-line, covers dice/link-grid/calculator); pie glow 300ms default-ease; three different loading indicators (spinner vs LoadingOrb vs skeleton); dead `drawAreas` import (`stacked-area-chart/index.tsx:35`); tinker toast hard-cut exit; save/switch full-page reload flash.

## Missed opportunities (additive, unplanned)

- Catalogue `LazyMount` frames pop in on scroll (`CatalogueView.tsx:78-82`) — short fade+translateY on reveal.
- Gallery skeleton→content hard swap + no first-mount stagger (`GalleryView.tsx:148-191`).
- Publish success ("Published 🎉") teleports in (`PublishDialog.tsx:105-129`) — the one place a delight beat is earned.
- Quote frame text swaps instantly each rotation (`packages/frames/src/quote.tsx:43`) — brief crossfade.
- Feed rows pop in on refresh (`packages/frames/src/feed-row.tsx`) — subtle fade + 30–80ms stagger for new rows.

## Judged by-design (do not re-report)

Orb wake bloom scale(0.7) (one-shot boot delight); frame first-paint cascade 450ms (deliberate, reduced-motion-handled); marquee/ticker linear easing (correct for constant motion); absence of per-tick value flashes (correct — 100+/day = never animate); editor rail lockstep compression (documented in-file).
