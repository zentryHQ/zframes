# 001 — Move zAI orb open/close onto the compositor (transform scale, not width/height)

- **Status**: BLOCKED (2026-07-11 — the center-stage orb change this plan targets was withdrawn from the working tree by its owning session, likely stashed; at HEAD the orb is the old 60px corner button with NO width/height animation, so the HIGH finding doesn't exist there. Re-check when the center-stage orb lands; the scrim backdrop-filter step remains valid at HEAD but isn't worth colliding with the in-flight orb work.)
- **Commit**: 4003be6 — NOTE: `apps/runtime/src/zai-orb.tsx` has UNCOMMITTED working-tree changes on top of this commit (the orb was moved to viewport center). All excerpts below were taken from the working tree. If an excerpt doesn't match, STOP and report.
- **Severity**: HIGH
- **Category**: 5 — Performance (plus 2 duration, 6 reduced-motion)
- **Estimated scope**: 1 file (`apps/runtime/src/zai-orb.tsx`, edits inside the `ORB_CSS` template string only)

## Problem

The orb open/close — the app's single highest-frequency motion path (Cmd/Ctrl+K and click, many times a day) — animates `width` and `height`:

```css
/* apps/runtime/src/zai-orb.tsx ~line 139 — current */
.zai-dock {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: var(--font-dmsans, system-ui, sans-serif);
  --orb-size-idle: 168px;
  --orb-size-open: 300px;
}
```

```css
/* apps/runtime/src/zai-orb.tsx ~line 342 — current */
.zai-orb {
  position: relative;
  width: var(--orb-size-idle);
  height: var(--orb-size-idle);
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  cursor: pointer;
  background: transparent;
  opacity: 0.6;
  transition:
    width 0.5s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    height 0.5s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 0.4s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-orb:hover { transform: scale(1.04); opacity: 0.92; }
.zai-orb:active { transform: scale(0.98); }
.zai-dock[data-busy="true"] .zai-orb { opacity: 1; }
.zai-dock[data-open="true"] .zai-orb {
  width: var(--orb-size-open);
  height: var(--orb-size-open);
  opacity: 1;
}
```

`width`/`height` are layout properties — every frame of the 500ms grow forces layout + paint + composite. Worse, the orb's WebGL canvas is sized `width/height: 100% !important` (`.zai-orb-canvas canvas` rule ~line 336), so the live WebGL canvas is re-laid-out every frame of the animation. 500ms is also at the very top of the modal budget (200–500ms) for something opened far more often than a modal.

Second issue in the same file — the scrim animates `backdrop-filter` itself across the full viewport:

```css
/* apps/runtime/src/zai-orb.tsx ~line 112–131 — current (abridged to the relevant lines) */
.zai-scrim {
  ...
  backdrop-filter: blur(0px) saturate(1);
  -webkit-backdrop-filter: blur(0px) saturate(1);
  transition:
    opacity 0.46s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    backdrop-filter 0.46s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    -webkit-backdrop-filter 0.46s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-scrim[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
  backdrop-filter: blur(2.5px) saturate(1.12);
  ...
}
```

Interpolating `backdrop-filter` re-samples the whole backdrop each frame (a known jank source, worst in Safari). The blur magnitude (2.5px) is fine; animating the property is the problem. Standard fix: make the filter static and transition only `opacity` — element opacity composites the backdrop-filter effect with it, so the blur still fades in/out visually.

## Target

The orb's layout box becomes a **fixed 300×300px** (the open size) in both states; open/close animates `transform: scale(0.56 ↔ 1)` (0.56 = 168/300, the exact old idle size). Layout is touched zero times per animation; the WebGL canvas backing store never resizes. Because CSS hit-testing follows transforms, the idle orb's clickable area shrinks to the visual 168px automatically — but the dock's now-larger static box must stop intercepting clicks, so the dock gets `pointer-events: none` with `auto` restored on its interactive children.

Exact target state (all inside `ORB_CSS`):

```css
/* .zai-dock — add one line */
.zai-dock {
  ...existing properties unchanged...
  pointer-events: none;
  --orb-size-idle: 168px;
  --orb-size-open: 300px;
}

/* .zai-panel — add one line (it currently inherits pointer-events; with the
   dock at none, the input pill would go dead without this) */
.zai-panel {
  ...existing properties unchanged...
  pointer-events: auto;
}

/* .zai-orb — fixed box, scale-driven size */
.zai-orb {
  position: relative;
  width: var(--orb-size-open);
  height: var(--orb-size-open);
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  cursor: pointer;
  background: transparent;
  pointer-events: auto;
  opacity: 0.6;
  /* 0.56 = 168px idle / 300px open — the old --orb-size-idle, expressed as a scale */
  --zai-orb-s: 0.56;
  transform: scale(var(--zai-orb-s));
  transition:
    transform 0.24s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-orb:hover { transform: scale(calc(var(--zai-orb-s) * 1.04)); opacity: 0.92; }
.zai-orb:active { transform: scale(calc(var(--zai-orb-s) * 0.98)); transition-duration: 0.12s; }
.zai-dock[data-busy="true"] .zai-orb { opacity: 1; }
.zai-dock[data-open="true"] .zai-orb {
  --zai-orb-s: 1;
  opacity: 1;
}
```

```css
/* .zai-scrim — static filter, opacity-only transition */
.zai-scrim {
  ...existing properties unchanged...
  backdrop-filter: blur(2.5px) saturate(1.12);
  -webkit-backdrop-filter: blur(2.5px) saturate(1.12);
  transition: opacity 0.3s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.zai-scrim[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
  /* backdrop-filter line REMOVED from this block — it's now static above */
  ...rest unchanged...
}
```

```css
/* inside the existing @media (prefers-reduced-motion: reduce) block (~line 537):
   the orb's size change is movement — snap it, keep the opacity feedback */
.zai-orb { transition: opacity 0.2s linear; }
```

Durations chosen per the audit playbook: high-frequency open/close sits at the LOW end of the 200–500ms modal budget → 240ms; press feedback budget is 100–160ms → the `:active` `transition-duration: 0.12s` override.

## Repo conventions to follow

- Every transition in this file reads `var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1))` — keep that exact token + fallback form.
- The CSS lives in the `ORB_CSS` template string in `zai-orb.tsx` — it is a JS template literal; backticks and `${}` must not be introduced.
- Exemplar of composed child animation already in file: `.zai-orb[data-webgl="true"] .zai-orb-canvas` (wake bloom, ~line 308) animates the canvas child independently — it composes under the orb's new base scale and needs NO change. Same for the `::before` breathing halo (~line 374) and `.zai-orb-beat` ring.

## Steps

1. `apps/runtime/src/zai-orb.tsx`, `.zai-dock` rule (~line 139): add `pointer-events: none;` before the `--orb-size-idle` line.
2. `.zai-panel` rule (~line 153): add `pointer-events: auto;`.
3. `.zai-orb` rule (~line 342): change `width`/`height` from `var(--orb-size-idle)` to `var(--orb-size-open)`; add `pointer-events: auto;`, `--zai-orb-s: 0.56;` and `transform: scale(var(--zai-orb-s));`; replace the 4-property transition with the 2-property one from Target (transform 0.24s, opacity 0.2s).
4. `.zai-orb:hover` / `.zai-orb:active` (~line 361): replace `scale(1.04)` with `scale(calc(var(--zai-orb-s) * 1.04))` and `scale(0.98)` with `scale(calc(var(--zai-orb-s) * 0.98))`; add `transition-duration: 0.12s;` to `:active` only.
5. `.zai-dock[data-open="true"] .zai-orb` (~line 365): replace the `width`/`height` lines with `--zai-orb-s: 1;` (keep `opacity: 1`).
6. `.zai-scrim` (~line 112): set `backdrop-filter`/`-webkit-backdrop-filter` to `blur(2.5px) saturate(1.12)` in the base rule; replace the 3-property transition with `transition: opacity 0.3s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));`. Remove the `backdrop-filter` declaration from `.zai-scrim[data-open="true"]`.
7. In the `@media (prefers-reduced-motion: reduce)` block (~line 537), add `.zai-orb { transition: opacity 0.2s linear; }` alongside the existing entries.

## Boundaries

- Do NOT touch any file other than `apps/runtime/src/zai-orb.tsx`.
- Do NOT change the JSX/DOM structure, the wake/breathe/beat keyframes, the nudge chip, or the panel `width` reveal (its cost is bounded and its reflow is design-load-bearing — out of scope here).
- Do NOT add dependencies.
- The dev server must be RESTARTED after edits if it was already running (`tmux:servers`) — but note the orb CSS is browser code, so HMR normally suffices; a hard refresh is enough.
- If any excerpt doesn't match the working tree (this file has uncommitted changes), STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` from the repo root — passes (CSS lives in a string; this mostly guards accidental template-literal breakage).
- **Feel check** (run `pnpm dev`, open http://localhost:37263):
  - Toggle the orb rapidly with Cmd/Ctrl+K — the scale must retarget smoothly mid-flight, never jump or restart from either end.
  - DevTools Performance panel: record an open/close; the flame chart must show NO purple Layout blocks driven by the orb during the animation (before this change there is one per frame).
  - Idle state: click just OUTSIDE the visible 168px orb (but within where the 300px box sits) — the click must reach the dashboard underneath, not dead-zone. Click ON the orb — opens. Type in the input pill when open — works.
  - Scrim: background blur still fades in on open and out on close (element opacity composites the static backdrop-filter).
  - DevTools Rendering panel → emulate `prefers-reduced-motion: reduce`: the orb SNAPS between sizes with only an opacity fade; no scale movement.
  - Slow the animation to 10% (DevTools Animations panel): the grow reads as one smooth scale, the WebGL scene inside scales with it (it renders at the 300px backing size and is downscaled at idle — slightly crisper when open is expected and fine).
- **Done when**: all feel checks pass and a Performance recording of open/close shows zero per-frame Layout work from the orb subtree.
