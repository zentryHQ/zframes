import type {
  DashboardAppearance,
  DashboardTheme,
  DashboardTypography,
} from "./spec";

/**
 * A named cosmetic look. Presets bundle the colour identity (`theme`),
 * typography, and the full card-surface treatment (`appearance`) into a single
 * one-click choice, so a user (or the generating agent) can pick a coherent
 * style without dialling every slider. Applying a preset just sets those spec
 * values — it's pure data, never a separate code path, so an applied preset
 * round-trips through `dashboard.json` exactly like a hand-tuned one. The editor
 * lists these as chips at the top of the Cosmetics rail; tweak any slider
 * afterwards to drift off the preset (its chip de-selects).
 *
 * A preset deliberately owns colour + type + surface, but NOT grid geometry
 * (columns/rowHeight/gap) — that's the user's layout, independent of the "look".
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
  },
];
