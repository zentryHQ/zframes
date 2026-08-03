import type {
  DashboardAppearance,
  DashboardTheme,
  DashboardTypography,
} from "./spec";

/**
 * A named cosmetic look. Presets bundle the colour identity (`theme`),
 * typography, the full card-surface treatment (`appearance`), AND the matching
 * animated backdrop (`scene`) into a single one-click choice, so a user (or the
 * generating agent) can pick a coherent style without dialling every slider.
 * Applying a preset just sets those spec values — it's pure data, never a
 * separate code path, so an applied preset round-trips through `dashboard.json`
 * exactly like a hand-tuned one. The editor lists these as chips at the top of
 * the Cosmetics rail; tweak any slider (or swap the scene) afterwards to drift
 * off the preset (its chip de-selects).
 *
 * A preset deliberately owns colour + type + surface + backdrop scene, but NOT
 * grid geometry (columns/rowHeight/gap) — that's the user's layout, independent
 * of the "look".
 *
 * The backdrop pairing is a `BackgroundScene` key whose authored hue tracks the
 * preset's accent, so once applied the accent hue-rotate (see the runtime's
 * background.tsx, which rotates relative to the loaded scene's `baseHue`) renders
 * the scene essentially as authored — the backdrop *matches* the look rather than
 * being an unrelated leftover.
 *
 * The first entry ("zframes") reproduces every default, so picking it is a full
 * reset of the cosmetic groups it owns.
 */
export type ThemePreset = {
  /** Stable id (kebab-case). */
  key: string;
  /** Short human label shown on the chip. */
  label: string;
  /** One line on the feel, for tooltips / agent reasoning. */
  description: string;
  /** Colour identity this preset sets. */
  theme: Pick<
    DashboardTheme,
    "accentHue" | "accentSat" | "baseHue" | "baseSat"
  >;
  /** Type family + numeric style this preset sets. */
  typography: Pick<DashboardTypography, "fontFamily" | "numericStyle">;
  /** Full card-surface treatment this preset sets. */
  appearance: Pick<
    DashboardAppearance,
    "radius" | "borderStrength" | "surfaceOpacity" | "density" | "elevation"
  >;
  /**
   * `BackgroundScene.key` of the animated backdrop this preset switches to (its
   * hue is chosen to match the preset's accent). Applying the preset sets
   * `background.type = "unicorn"` + that scene's `projectId`.
   */
  scene: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "zframes",
    label: "zframes",
    description:
      "The signature indigo on near-black navy, DM Sans, soft rounded cards — the default look.",
    theme: { accentHue: 242, accentSat: 90, baseHue: 233, baseSat: 20 },
    typography: { fontFamily: "sans", numericStyle: "proportional" },
    appearance: {
      radius: 18,
      borderStrength: 0.22,
      surfaceOpacity: 1,
      density: 1,
      elevation: 1,
    },
    scene: "aurora",
  },
  {
    key: "terminal",
    label: "Terminal",
    description:
      "Phosphor green on black, monospaced, fixed-width digits, sharp dense flat cards — a trading-terminal feel.",
    theme: { accentHue: 145, accentSat: 85, baseHue: 150, baseSat: 16 },
    typography: { fontFamily: "mono", numericStyle: "tabular" },
    appearance: {
      radius: 4,
      borderStrength: 0.34,
      surfaceOpacity: 1,
      density: 0.85,
      elevation: 0.4,
    },
    scene: "verdant",
  },
  {
    key: "amber",
    label: "Amber",
    description:
      "Warm amber on charcoal, monospaced, tabular, slightly sharp cards — a retro CRT console.",
    theme: { accentHue: 38, accentSat: 95, baseHue: 30, baseSat: 18 },
    typography: { fontFamily: "mono", numericStyle: "tabular" },
    appearance: {
      radius: 6,
      borderStrength: 0.3,
      surfaceOpacity: 1,
      density: 0.9,
      elevation: 0.6,
    },
    scene: "ember",
  },
  {
    key: "graphite",
    label: "Graphite",
    description:
      "Near-grayscale slate, faint rims, flat quiet cards, tabular numbers — calm and neutral.",
    theme: { accentHue: 220, accentSat: 8, baseHue: 220, baseSat: 4 },
    typography: { fontFamily: "sans", numericStyle: "tabular" },
    appearance: {
      radius: 14,
      borderStrength: 0.14,
      surfaceOpacity: 1,
      density: 1,
      elevation: 0.35,
    },
    // aurora, but the near-zero accent saturation crushes it to grayscale via
    // the backdrop's saturate() — so the scene reads as calm neutral drift.
    scene: "aurora",
  },
  {
    key: "synthwave",
    label: "Synthwave",
    description:
      "Hot magenta on deep violet-black, faintly glassy cards floating on a strong glow — vivid and nocturnal.",
    theme: { accentHue: 320, accentSat: 88, baseHue: 280, baseSat: 26 },
    typography: { fontFamily: "sans", numericStyle: "proportional" },
    appearance: {
      radius: 20,
      borderStrength: 0.3,
      surfaceOpacity: 0.9,
      density: 1,
      elevation: 1.7,
    },
    scene: "dusk",
  },
  {
    key: "editorial",
    label: "Editorial",
    description:
      "A warm serif on soft charcoal-brown, roomy padding, gentle lift — reads like a financial broadsheet.",
    theme: { accentHue: 22, accentSat: 60, baseHue: 28, baseSat: 12 },
    typography: { fontFamily: "serif", numericStyle: "proportional" },
    appearance: {
      radius: 10,
      borderStrength: 0.18,
      surfaceOpacity: 1,
      density: 1.15,
      elevation: 0.8,
    },
    scene: "ember",
  },
  {
    key: "nord",
    label: "Nord",
    description:
      "Cool arctic blue-grey — a calm, muted ice-blue accent on slate, soft rounded cards. Understated and easy on the eyes.",
    theme: { accentHue: 200, accentSat: 55, baseHue: 220, baseSat: 16 },
    typography: { fontFamily: "sans", numericStyle: "tabular" },
    appearance: {
      radius: 12,
      borderStrength: 0.2,
      surfaceOpacity: 1,
      density: 1,
      elevation: 0.6,
    },
    scene: "tide",
  },
  {
    key: "oceanic",
    label: "Oceanic",
    description:
      "Deep teal on blue-black — a vivid sea-green accent, roomy rounded cards. Fresh and marine.",
    theme: { accentHue: 185, accentSat: 70, baseHue: 200, baseSat: 22 },
    typography: { fontFamily: "sans", numericStyle: "proportional" },
    appearance: {
      radius: 16,
      borderStrength: 0.22,
      surfaceOpacity: 1,
      density: 1,
      elevation: 0.8,
    },
    scene: "tide",
  },
  {
    key: "crimson",
    label: "Crimson",
    description:
      "Bold red on near-black — a hot crimson accent, tabular figures, sharp dense cards. Aggressive, high-contrast trading floor.",
    theme: { accentHue: 356, accentSat: 78, baseHue: 350, baseSat: 15 },
    typography: { fontFamily: "sans", numericStyle: "tabular" },
    appearance: {
      radius: 8,
      borderStrength: 0.3,
      surfaceOpacity: 1,
      density: 0.95,
      elevation: 1,
    },
    scene: "ember",
  },
  {
    key: "gold-noir",
    label: "Gold Noir",
    description:
      "Luxe gold on black — a warm gilt accent, serif type, roomy lifted cards. Understated wealth-desk elegance.",
    theme: { accentHue: 45, accentSat: 85, baseHue: 40, baseSat: 10 },
    typography: { fontFamily: "serif", numericStyle: "proportional" },
    appearance: {
      radius: 10,
      borderStrength: 0.25,
      surfaceOpacity: 1,
      density: 1.1,
      elevation: 1.2,
    },
    scene: "ember",
  },
];

/**
 * A named animated background scene. Each entry points at a public Unicorn
 * Studio project; the editor's Cosmetics rail lists them as one-click swatches
 * (under the "Scene" background style) and the runtime's <Background> renders
 * the chosen `projectId`. Pure data — picking one just sets the spec's
 * `background.type = "unicorn"` + `background.projectId`, so it round-trips
 * through dashboard.json exactly like any other cosmetic choice; the agent can
 * pick one too.
 *
 * Adding a scene = drop a `{ key, label, projectId }` here. A dead or unknown
 * projectId degrades to the body gradient (see runtime's background.tsx), so
 * only ship IDs verified to load. `swatch` is a representative CSS background
 * (the rail has no live thumbnail — selecting a scene repaints the real
 * full-bleed backdrop instantly), best matched to the scene's actual palette.
 */
export type BackgroundScene = {
  /** Stable id (kebab-case). */
  key: string;
  /** Short human label shown on the swatch. */
  label: string;
  /** One line on the feel, for tooltips / agent reasoning. */
  description: string;
  /** Unicorn Studio public project id rendered behind the dashboard. */
  projectId: string;
  /**
   * The scene's authored dominant hue (0–360) — the anchor the runtime rotates
   * *away from*: the backdrop is spun by (accentHue − baseHue), so when this
   * value is the scene's real hue the backdrop lands exactly on the dashboard
   * accent and moves in lockstep with the cards.
   *
   * **These are MEASURED, not guessed.** The scenes are remotely hosted, so this
   * field is a claim about a file nobody here can read, and every value except
   * Aurora's was originally wrong — three of them by more than 100°, which left
   * boards wearing a colour nobody chose (the "warm ember" macro board rendered
   * violet). Measured 2026-08-03 by isolating each scene at `/embed/<board>`
   * (hide the content layer and the swatch layer, clear the filter), screenshotting,
   * and taking the chroma×value-weighted circular mean hue of the capture.
   *
   * **Re-measure that way if a hosted scene is ever re-authored** — a scene can
   * change under us with no local diff, and nothing in CI can catch it.
   */
  baseHue: number;
  /**
   * Representative CSS `background` for the rail swatch (no live thumbnail).
   *
   * Not decoration: this layer actually renders under the live scene (at 0.6×
   * the scene opacity) and is the whole backdrop while the scene is loading,
   * suspended, or gated off for reduced-motion / low-end devices. So it must
   * approximate the REAL scene — a prettier-but-wrong gradient here silently
   * becomes the board's colour on every one of those paths.
   */
  swatch: string;
};

/**
 * The default backdrop scene's Unicorn Studio project id — Aurora, the
 * signature indigo. The single source every host reads: the CLI's `init`
 * skeleton, the explorer's front door, and the aurora entry below.
 */
export const SCENE_DEFAULT_PROJECT_ID = "YrTzGatwjK7EoFpCSfgZ";

export const BACKGROUND_SCENES: BackgroundScene[] = [
  {
    key: "aurora",
    label: "Aurora",
    description:
      "Broad bands of light drifting behind fine horizontal scanlines — the signature zframes scene, and the default backdrop.",
    projectId: SCENE_DEFAULT_PROJECT_ID,
    // Measures 264°, but stays pinned to 242 ON PURPOSE: 242 is the accent
    // default, so the out-of-the-box dashboard hue-rotates by 0° and the
    // signature look every existing board already ships with is preserved
    // (presets.test.ts pins that invariant). The cost is that Aurora alone sits
    // ~22° off its accent instead of exactly on it — a deliberate design choice
    // about the default, not the measurement error the other five were.
    baseHue: 242,
    swatch:
      "radial-gradient(120% 120% at 30% 20%, hsl(263 65% 58%) 0%, hsl(265 72% 40%) 45%, hsl(261 70% 14%) 100%)",
  },
  {
    key: "nebula",
    label: "Nebula",
    description:
      "Hard glitch scanlines over steel and olive bands. The busiest scene here, and the only one that renders a zframes wordmark of its own — read it as branded, not neutral.",
    projectId: "K42KSY4FXeXhjVOj9RgT",
    baseHue: 229, // measured (was 268)
    swatch:
      "radial-gradient(120% 120% at 70% 30%, hsl(230 52% 72%) 0%, hsl(212 20% 34%) 45%, hsl(60 25% 7%) 100%)",
  },
  {
    key: "ember",
    label: "Ember",
    description:
      "A bright iridescent wash folding through itself — by far the most luminous scene in the set, and the one that most lifts a whole board.",
    projectId: "E4221P7lwTy049d7ISxc",
    baseHue: 254, // measured (was 24 — this scene was never warm)
    swatch:
      "radial-gradient(120% 120% at 30% 25%, hsl(187 35% 80%) 0%, hsl(242 45% 70%) 45%, hsl(254 80% 46%) 100%)",
  },
  {
    key: "tide",
    label: "Tide",
    description:
      "A dense rain of glyphs falling through the dark — the most textural scene, and the closest to a terminal.",
    projectId: "cYpXuEzDqm4r3fdp4TGx",
    baseHue: 264, // measured (was 190 — no teal in it)
    swatch:
      "radial-gradient(120% 120% at 70% 25%, hsl(265 60% 30%) 0%, hsl(264 56% 10%) 45%, hsl(265 40% 3%) 100%)",
  },
  {
    key: "verdant",
    label: "Verdant",
    description:
      "Big soft blobs of light bleeding across near-black — slow, diffuse, and the least busy of the set.",
    projectId: "PrFtFGDE5duemLmr2YKQ",
    baseHue: 4, // measured (was 150 — this scene is scarlet, not green)
    swatch:
      "radial-gradient(120% 120% at 30% 25%, hsl(6 85% 56%) 0%, hsl(0 70% 24%) 45%, hsl(0 30% 5%) 100%)",
  },
  {
    key: "dusk",
    label: "Dusk",
    description:
      "Fine silver ribbons curving through black. NEAR-MONOCHROME — it barely takes the accent the way every other scene does, so pick it for texture rather than colour.",
    projectId: "qpoj0wFWmgwRVXmzRMiL",
    // Measured 31°, but off only ~7% of pixels at 0.23 saturation: there is
    // almost no chroma here to rotate, which is the honest reason this scene
    // stays silver whatever the accent does.
    baseHue: 31,
    swatch:
      "radial-gradient(120% 120% at 70% 30%, hsl(35 6% 76%) 0%, hsl(30 5% 22%) 45%, hsl(0 0% 2%) 100%)",
  },
];

/**
 * The authored hue the runtime rotates the backdrop *away from* when no scene is
 * known — the signature indigo. Equals the aurora scene's `baseHue` and the
 * accent default, so an unrolled default dashboard hue-rotates by 0°.
 */
export const SCENE_DEFAULT_HUE = 242;

/**
 * The authored dominant hue of the scene with this `projectId`, or
 * {@link SCENE_DEFAULT_HUE} if it isn't one of the curated scenes (a custom
 * projectId, or none). The host feeds this to the backdrop as the reference the
 * dashboard accent hue-rotates the scene relative to.
 *
 * Because the rotation is (accentHue − this), a correct anchor means **the
 * backdrop always lands on the board's accent** — the scene contributes motion
 * and texture, the accent contributes the colour, and the two stay in lockstep
 * when either is rolled. An anchor that does NOT match the scene leaves the
 * backdrop stranded at (sceneTrueHue − anchor) away from the cards, which is
 * exactly how a "warm ember" board came to render violet.
 *
 * Kept host-side so the heavy runtime background stays a dumb renderer and
 * @zframes/core owns the scene registry.
 */
export function sceneBaseHue(projectId: string | undefined): number {
  const scene = BACKGROUND_SCENES.find((s) => s.projectId === projectId);
  return scene ? scene.baseHue : SCENE_DEFAULT_HUE;
}
