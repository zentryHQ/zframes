/**
 * The shared interactive-surface treatment for content controls (calculator
 * fields, link-grid tiles): a quiet bordered tile whose border lights up in the
 * dashboard accent on hover/focus — so controls recolor with the theme instead
 * of staying a fixed grey. One radius (`rounded-md`) across all of them. Layout
 * (flex/padding/gap) stays at the call site; this owns only the surface + states.
 */
export const interactiveSurface =
  "rounded-md border border-white/[0.08] bg-white/[0.04] transition-colors hover:bg-white/[0.06] hover:border-[var(--color-accent-line)] focus-within:border-[var(--color-accent-line)]";
