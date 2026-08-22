// The accent → CSS-filter math both hosts apply to a Unicorn scene.
//
// A scene's colors are baked into the hosted Unicorn project — the host can't
// repaint the WebGL — but a CSS `hue-rotate` + `saturate` on the wrapper spins
// and mutes the whole scene, engine-agnostically. Both the runtime's dashboard
// backdrop and the explorer's embedded-board backdrop do exactly that, so the
// numbers live here rather than being kept in step by hand in two files.
//
// Deliberately pure arithmetic and nothing else: @zframes/unicorn is a generic
// leaf (ESLint forbids `@zframes/*` imports here), so this file must never grow
// a spec type — a host reads `accentHue`/`accentSat` off its own config and
// passes plain numbers in.

/** The spec's default accent hue (the zframes purple). */
export const ACCENT_DEFAULT_HUE = 242;

/** The spec's default accent saturation — maps to `saturate(1)`, a no-op. */
export const ACCENT_DEFAULT_SAT = 90;

/**
 * Degrees to `hue-rotate` a scene by, given the dashboard accent and the
 * *loaded scene's own authored hue*. A scene paired to a matching accent (every
 * theme preset pairs one) is a 0° no-op rendered exactly as authored; any
 * rolled or edited accent spins the backdrop from there, in lockstep with the
 * card accents.
 *
 * Shortest spin: the offset is mapped into (-180, 180] so the transition never
 * sweeps the long way round the wheel. The double modulo is load-bearing —
 * JS `%` keeps the sign of the dividend, so a negative offset would otherwise
 * fall outside the range.
 */
export const accentRotation = (accentHue: number, sceneHue: number) => {
  const d = (((accentHue - sceneHue) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};

/**
 * `saturate()` multiplier for a given accent saturation, so a muted accent
 * (low `accentSat`) reads muted in the backdrop and not just on the cards.
 * 90 (the spec default) → 1, a no-op.
 */
export const accentSaturation = (accentSat: number) =>
  Math.round((accentSat / ACCENT_DEFAULT_SAT) * 1000) / 1000;
