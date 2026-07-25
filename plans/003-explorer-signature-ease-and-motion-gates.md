# 003 — Route explorer Tailwind transitions through the signature curve and gate the raw hover transforms

- **Status**: DONE (landed on main, 46cb417, 2026-07-11)
- **Commit**: 4003be6
- **Severity**: MEDIUM
- **Category**: 7 — Cohesion & tokens (plus 5 performance, 6 accessibility)
- **Estimated scope**: 5 files in `apps/explorer/app` (globals.css + 4 tsx), small diffs

## Problem

Three related gaps in the explorer site (Next.js 15, Tailwind v4):

**A. The site's signature curve never reaches Tailwind transitions.** `--zf-ease-out: cubic-bezier(0.23, 1, 0.32, 1)` is defined at `apps/explorer/app/globals.css:43` and used by the hand-written classes (`.zf-interactive`, `.card-lift`, `.zf-press`, `dialog-in`) — but every Tailwind `transition-*` utility in the app (42 uses) runs Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)`. Two easing vocabularies on one page.

**B. `transition-all` on the most-browsed element.** The gallery card's hover arrow uses Tailwind's `transition-all` (compiles to `transition-property: all` — the playbook's "always a finding") at 300ms, the top of the hover budget:

```tsx
// apps/explorer/app/lib/DashboardCard.tsx:57 — current
<span className="translate-x-1 text-sm text-indigo-300 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
  →
</span>
```

**C. Raw Tailwind hover-transforms escape both accessibility gates.** The `@media (prefers-reduced-motion: reduce)` block (globals.css:344-365) and the `@media (hover: none)` block (globals.css:368-373) only neutralise the named classes (`.zf-interactive`, `.card-lift`, `.zf-press`). These utility-authored transforms still move for reduced-motion users and stick after tap on touch:

```tsx
// apps/explorer/app/layout.tsx:30 — current (header logo, every page)
className="h-7 w-7 transition-transform duration-300 group-hover:scale-105"
```

```tsx
// apps/explorer/app/page.tsx:42 and :177 — current (hero CTAs; both identical)
className="glow-brand zf-press rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
```

```tsx
// apps/explorer/app/signin/page.tsx:53 — current (Google button)
className="glow-brand zf-press flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
```

Bonus in the same file: the `.zf-interactive`/`.card-lift` hover runs at `0.28s` (globals.css:143-145 and 219-224) — under the 300ms ceiling but statelier than the terminal's "crisp/fast" personality wants on the most frequent interaction.

## Target

1. **One-line theme fix**: Tailwind v4 reads `--default-transition-timing-function` from the `@theme` block for all `transition-*` utilities. Add it, set to the signature curve. Every Tailwind transition in the app then rides the same ease as the hand-written classes. (The default duration stays Tailwind's 150ms — inside the 125–200ms hover budget.)
2. **Gated motion classes** replace the raw utilities, defined once in globals.css next to `.zf-press` and covered by BOTH existing media gates.
3. `transition-all` eliminated; the arrow reveal becomes a scoped class animating only `opacity` and `transform` at 200ms.
4. `.zf-interactive` and `.card-lift` durations: `0.28s` → `0.22s` (all transitioned properties in both rules).

Exact CSS to add to `apps/explorer/app/globals.css` (place directly after the `.zf-press` rules, ~line 260):

```css
/* Gated hover motion for one-off cases that previously used raw Tailwind
 * utilities — defined here so the reduced-motion and touch blocks below can
 * neutralise them alongside .zf-interactive/.card-lift/.zf-press. */
.zf-lift {
  transition: transform 0.2s var(--zf-ease-out);
}
.zf-lift:hover:not(:disabled) {
  transform: translateY(-2px);
}
.zf-grow {
  transition: transform 0.2s var(--zf-ease-out);
}
.zf-grow:hover,
.group:hover .zf-grow {
  transform: scale(1.05);
}
/* Gallery-card hover arrow: slides in + fades. Only transform/opacity animate. */
.zf-arrow-reveal {
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity 0.2s var(--zf-ease-out),
    transform 0.2s var(--zf-ease-out);
}
.group:hover .zf-arrow-reveal {
  opacity: 1;
  transform: translateX(0);
}
```

Additions INSIDE the existing `@media (prefers-reduced-motion: reduce)` block (globals.css:344, alongside the existing `.zf-interactive:hover, .card-lift:hover, .zf-press:active` entry):

```css
  .zf-lift:hover,
  .zf-grow:hover,
  .group:hover .zf-grow {
    transform: none;
  }
  /* Arrow keeps its opacity reveal (comprehension) but loses the slide. */
  .zf-arrow-reveal,
  .group:hover .zf-arrow-reveal {
    transform: none;
  }
```

Additions INSIDE the existing `@media (hover: none)` block (globals.css:368):

```css
  .zf-lift:hover,
  .zf-grow:hover,
  .group:hover .zf-grow {
    transform: none;
  }
```

Addition to the `@theme` block (globals.css:20, after the color tokens):

```css
  /* Route every Tailwind transition-* utility through the site's signature
   * quint ease-out (mirrors --zf-ease-out below — @theme can't var()-reference
   * a :root token, so the value is repeated verbatim). */
  --default-transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);
```

## Repo conventions to follow

- Gated motion classes live in `globals.css` with the `zf-` prefix; the exemplar is `.zf-press` (globals.css:253-258) — short comment, transform-only, covered by the reduced-motion block.
- The `@theme` block already exists at globals.css:20 (fonts + colors) — extend it, don't create a second one.
- Class order in the tsx files follows Prettier's Tailwind sorting; run whatever format-on-save produces, don't hand-order.

## Steps

1. `apps/explorer/app/globals.css`: add `--default-transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);` inside the `@theme` block.
2. Same file: add the `.zf-lift` / `.zf-grow` / `.zf-arrow-reveal` rules after `.zf-press` (exact CSS above).
3. Same file: extend the `@media (prefers-reduced-motion: reduce)` block and the `@media (hover: none)` block with the additions above.
4. Same file: in `.zf-interactive` (lines ~143-145) and `.card-lift` (lines ~219-224), change every `0.28s` to `0.22s` (3 properties in the first rule, 4 in the second).
5. `apps/explorer/app/layout.tsx:30`: `className="h-7 w-7 transition-transform duration-300 group-hover:scale-105"` → `className="zf-grow h-7 w-7"`.
6. `apps/explorer/app/page.tsx:42` and `:177`: in both CTA Links, replace `transition-transform hover:-translate-y-0.5` with `zf-lift` (keep `glow-brand zf-press` and all other classes).
7. `apps/explorer/app/signin/page.tsx:53`: replace `transition-transform hover:-translate-y-0.5 disabled:translate-y-0` with `zf-lift` (keep `disabled:opacity-50`; the `:not(:disabled)` in the class covers the disabled case).
8. `apps/explorer/app/lib/DashboardCard.tsx:57`: `className="translate-x-1 text-sm text-indigo-300 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"` → `className="zf-arrow-reveal text-sm text-indigo-300"`. (The parent card already has `group` — verify it does before relying on `.group:hover`; if it doesn't, STOP and report.)

## Boundaries

- Do NOT touch `.zf-interactive`/`.card-lift` hover *distances* or colors — durations only.
- Do NOT convert other Tailwind `transition-*` uses to classes; the theme default now fixes their curve globally.
- Do NOT touch the runtime app or shared packages.
- Do NOT add dependencies.
- If a cited excerpt doesn't match, STOP and report.

## Verification

- **Mechanical**: `pnpm typecheck` passes; `pnpm --filter explorer build` (or `next build` in `apps/explorer`) completes.
- **Feel check** (run the explorer dev server, `pnpm --dir apps/explorer exec next dev -p 37264`):
  - Gallery card hover: arrow slides in over ~200ms with the signature curve; DevTools → the `<span>` shows `transition-property: opacity, transform` (NOT `all`).
  - Header logo hover and hero CTA hover still lift/scale as before.
  - DevTools Rendering → emulate `prefers-reduced-motion: reduce`: logo, CTAs, Google button, and card arrow no longer move (arrow still fades in — comprehension kept); card hover halo still appears.
  - Device toolbar → a touch device: tapping a gallery card must not leave a stuck lifted card or stuck arrow-slide.
  - Card hover at 0.22s reads snappier than before but not twitchy (compare by toggling the value in DevTools).
- **Done when**: no `transition-all` remains in `apps/explorer/app`, reduced-motion emulation shows zero positional movement on the five touched elements, and every Tailwind transition inspected in DevTools reports the `cubic-bezier(0.23, 1, 0.32, 1)` curve.
