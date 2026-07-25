# 005 — Crisp up the frame-card hover (250ms → 150ms)

- **Status**: DONE (landed on main, 20ca5e2, 2026-07-11)
- **Commit**: 4003be6
- **Severity**: MEDIUM
- **Category**: 1 — Purpose & frequency / 2 — Easing & duration
- **Estimated scope**: 1 file (`packages/core/src/frame-content.tsx`), 3 value changes

## Problem

The frame-card hover (lift + border + glow crossfade) is the most frequent interaction in the entire product — every card on every dashboard, in both the runtime and the explorer's embedded previews. It runs at 250ms. The audit playbook puts hover effects at **125–200ms**, and the frequency table says tens-of-times-per-day interactions should be reduced, not savored. 250ms with a strong quint ease-out reads floaty on hover-in and slow to release on hover-out.

The engineering is already right (transform + border on the card, gradient/shadow on an opacity-faded `::after` — GPU-friendly); ONLY the duration is off.

```css
/* packages/core/src/frame-content.tsx:~121-123 (inside FRAME_CSS) — current */
transition:
  border-color 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
  transform 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
```

```css
/* packages/core/src/frame-content.tsx:~157 (the .zf-frame:not(.zf-frame--error)::after rule) — current */
transition: opacity 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
```

The editor's stationary-box hover (`packages/editor/src/editor.css:109-115`) only sets `transform`/`border-color` on `:hover` — it rides these same transitions, so it inherits the fix with no edit.

## Target

All three hover-path durations become `0.15s`. Curve and everything else unchanged:

```css
/* target — card rule */
transition:
  border-color 0.15s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
  transform 0.15s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));

/* target — ::after rule */
transition: opacity 0.15s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
```

## Repo conventions to follow

- `FRAME_CSS` is a JS template literal in `frame-content.tsx` — box-shadow values etc. contain escaped backticks; change ONLY the three duration tokens, character-for-character otherwise.
- Every transition keeps the `var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1))` token + fallback form.
- Do NOT touch the entrance animation on the same rule (`animation: zf-enter 0.45s …` + stagger) — the first-paint cascade is deliberate and reduced-motion-handled.

## Steps

1. `packages/core/src/frame-content.tsx`, `.zf-frame` rule (~line 121-123): change both `0.25s` to `0.15s` (border-color + transform lines).
2. Same file, `.zf-frame:not(.zf-frame--error)::after` rule (~line 157): change `0.25s` to `0.15s` in its `transition: opacity …` line.

## Boundaries

- Do NOT touch any other duration, the `zf-enter` keyframes, the reduced-motion block, or any other file (including `packages/editor/src/editor.css` — it inherits).
- Do NOT add dependencies.
- If the excerpts don't match, STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` passes. `packages/core/src/barrel-surface.test.ts` untouched (no export changes).
- **Feel check**: run `pnpm dev` (runtime, :37263) over a populated dashboard:
  - Sweep the cursor quickly across a row of cards: each card's lift + glow should track the cursor almost immediately and release crisply — no card should still be settling after the cursor has left it.
  - Hover ON one card and hold: the lift must not feel twitchy or abrupt — the quint ease-out at 150ms should still read as a smooth settle. If it reads harsh, 0.18s is the acceptable upper fallback (still in budget); note the deviation in this file.
  - Also check one embedded preview on the explorer (`/d/<id>` page) — same behavior.
- **Done when**: hover-in and hover-out both complete within ~150ms and rapid cursor sweeps leave no trailing half-lifted cards.
