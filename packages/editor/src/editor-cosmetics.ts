import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  BACKGROUND_SCENES,
  THEME_PRESETS,
  type ThemePreset,
} from "@zframes/spec/presets";
import {
  DashboardSpecSchema,
  FONT_FAMILY_STACKS,
  NUMERIC_VARIANTS,
  surfaceModeVars,
  type DashboardBackground,
  type DashboardSpec,
  type DashboardTypography,
} from "@zframes/spec/spec";

/**
 * The spec's own default for every cosmetic field, parsed straight out of the
 * schema.
 *
 * Each "Reset" link in the Cosmetics rail decides whether to appear by comparing
 * the live value to a default, and each of those was an inline literal repeated
 * at 20-odd call sites — so a schema default could change and silently desync
 * every one of them. It already had: the schema's `rowHeight` default is 96,
 * and a hand-written `!== 90` here would have offered "Reset" on an untouched
 * board and reset it to a value the schema never chose.
 */
export const SPEC_DEFAULTS = DashboardSpecSchema.parse({
  title: "",
  frames: [],
});

/**
 * Every dashboard-wide cosmetic the rail edits, flattened into one bag.
 *
 * This was 30-odd sibling `useState`s in the editor, read by four separate
 * concerns (the `--zf-*` style bag, `collectSpec`, `activePresetKey`, and the
 * host live-change callbacks) — so adding a knob meant touching all four, and a
 * missed one failed silently: the slider moved, the board looked right, and the
 * value never reached the saved file. One bag means one source for all four.
 *
 * The `bg*` prefix is not cosmetic tidiness: `background.scale` and
 * `typography.scale` collide, so a flat bag can't reuse the spec's own field
 * names verbatim.
 */
export type CosmeticValues = {
  accentHue: number;
  accentSat: number;
  baseHue: number;
  baseSat: number;
  upColor: string;
  downColor: string;
  surface: DashboardSpec["theme"]["surface"];
  mode: DashboardSpec["grid"]["mode"];
  gap: number;
  paddingX: number;
  columns: number;
  rowHeight: number;
  radius: number;
  borderStrength: number;
  surfaceOpacity: number;
  density: number;
  elevation: number;
  fontFamily: DashboardTypography["fontFamily"];
  numericStyle: DashboardTypography["numericStyle"];
  fontScale: number;
  bgType: DashboardBackground["type"];
  bgProjectId: string;
  bgOpacity: number;
  bgColor: string;
  bgGradFrom: string;
  bgGradTo: string;
  bgGradAngle: number;
  bgImageUrl: string;
  bgImageFit: DashboardBackground["imageFit"];
  bgImageBlur: number;
  bgOverlayOpacity: number;
  currencyCode: DashboardSpec["currency"]["code"];
};

/** The subset of cosmetic fields a slider can drive. */
export type NumericCosmeticKey = {
  [K in keyof CosmeticValues]: CosmeticValues[K] extends number ? K : never;
}[keyof CosmeticValues];

/** The subset a colour swatch can drive. */
export type ColorCosmeticKey = "upColor" | "downColor" | "bgColor";

/**
 * The cosmetic half of a `DashboardSpec` — everything the rail owns, and nothing
 * about frames.
 *
 * This is what the editor reports to its host on every change (`onLiveChange`),
 * because chrome the editor doesn't own — the full-bleed backdrop, the page
 * header, the ticker tape, the `:root` chart tokens — has to repaint with the
 * slider rather than only after a save + reload.
 */
export type LiveCosmetics = Pick<
  DashboardSpec,
  "grid" | "background" | "theme" | "typography" | "appearance" | "currency"
>;

/** Read every cosmetic out of a spec. The inverse of `Cosmetics.slices`. */
export function cosmeticsFromSpec(spec: DashboardSpec): CosmeticValues {
  return {
    accentHue: spec.theme.accentHue,
    accentSat: spec.theme.accentSat,
    baseHue: spec.theme.baseHue,
    baseSat: spec.theme.baseSat,
    upColor: spec.theme.upColor,
    downColor: spec.theme.downColor,
    surface: spec.theme.surface,
    mode: spec.grid.mode,
    gap: spec.grid.gap,
    paddingX: spec.grid.paddingX,
    columns: spec.grid.columns,
    rowHeight: spec.grid.rowHeight,
    radius: spec.appearance.radius,
    borderStrength: spec.appearance.borderStrength,
    surfaceOpacity: spec.appearance.surfaceOpacity,
    density: spec.appearance.density,
    elevation: spec.appearance.elevation,
    fontFamily: spec.typography.fontFamily,
    numericStyle: spec.typography.numericStyle,
    fontScale: spec.typography.scale,
    bgType: spec.background.type,
    // The projectId stays "sticky" across a none/gradient detour so toggling
    // back to a scene restores the last pick; default to the first curated scene
    // if the spec never named one.
    bgProjectId: spec.background.projectId ?? BACKGROUND_SCENES[0].projectId,
    bgOpacity: spec.background.opacity,
    bgColor: spec.background.color,
    bgGradFrom: spec.background.gradientFrom,
    bgGradTo: spec.background.gradientTo,
    bgGradAngle: spec.background.gradientAngle,
    bgImageUrl: spec.background.imageUrl ?? "",
    bgImageFit: spec.background.imageFit,
    bgImageBlur: spec.background.imageBlur,
    bgOverlayOpacity: spec.background.overlayOpacity,
    currencyCode: spec.currency.code,
  };
}

/** Every cosmetic at the value the schema chose. What "Reset" restores. */
export const COSMETIC_DEFAULTS: CosmeticValues =
  cosmeticsFromSpec(SPEC_DEFAULTS);

/**
 * Whether a field still sits at its schema default — the one place the 22
 * "Reset" links decide whether to appear.
 *
 * Colours compare case-insensitively: an `<input type="color">` reports `#16C784`
 * where the schema default is written `#16c784`, and a strict compare would keep
 * offering "Reset" for a value that is already the default.
 */
export function isCosmeticDefault<K extends keyof CosmeticValues>(
  values: CosmeticValues,
  key: K,
): boolean {
  const value = values[key];
  const fallback = COSMETIC_DEFAULTS[key];
  if (typeof value === "string" && typeof fallback === "string") {
    return value.toLowerCase() === fallback.toLowerCase();
  }
  return value === fallback;
}

/** The whole cosmetics layer, as the rail and the editor consume it. */
export type Cosmetics = {
  values: CosmeticValues;
  /** Set one field. A no-op write keeps the same object, so React still bails. */
  set: <K extends keyof CosmeticValues>(
    key: K,
    value: CosmeticValues[K],
  ) => void;
  /** Restore one field to its schema default. */
  reset: (key: keyof CosmeticValues) => void;
  isDefault: (key: keyof CosmeticValues) => boolean;
  /** Apply a named one-click look (colour + type + card surface + backdrop). */
  applyPreset: (preset: ThemePreset) => void;
  /** The preset whose every owned value matches the live state, if any. */
  activePresetKey: string | null;
  /** The inline `--zf-*` bag for `.zf-editor`. */
  styleVars: CSSProperties;
  /** The cosmetic half of the spec, live — what `collectSpec` merges and what
   *  the host is told about. */
  slices: LiveCosmetics;
  /** Write a whole snapshot back (undo / redo / Cancel). */
  apply: (next: DashboardSpec) => void;
};

/**
 * One hook owning every dashboard-wide cosmetic: the live values, the setters,
 * the reset comparisons, the preset match, the `--zf-*` style bag, the spec
 * slices `collectSpec` writes, and the live report the host repaints from.
 */
export function useCosmetics({
  spec,
  onLiveChange,
}: {
  spec: DashboardSpec;
  onLiveChange?: (cosmetics: LiveCosmetics | null) => void;
}): Cosmetics {
  const [values, setValues] = useState<CosmeticValues>(() =>
    cosmeticsFromSpec(spec),
  );

  const set = useCallback(
    <K extends keyof CosmeticValues>(key: K, value: CosmeticValues[K]) => {
      // Identical writes keep the same object so React bails out of the render,
      // exactly as 30 separate `useState`s did.
      setValues((prev) =>
        prev[key] === value ? prev : { ...prev, [key]: value },
      );
    },
    [],
  );

  const reset = useCallback((key: keyof CosmeticValues) => {
    setValues((prev) => ({ ...prev, [key]: COSMETIC_DEFAULTS[key] }));
  }, []);

  const isDefault = useCallback(
    (key: keyof CosmeticValues) => isCosmeticDefault(values, key),
    [values],
  );

  // One-click looks. A preset sets the full colour, typography, and card-surface
  // state it owns (everything except grid geometry) — no separate render path, so
  // it round-trips through the spec exactly like a hand-tuned look; tweak any
  // slider afterwards to drift off it.
  const applyPreset = useCallback((preset: ThemePreset) => {
    // Switch to the preset's paired backdrop so the animated scene matches the
    // look. Its hue tracks the accent, so the host's accent hue-rotate (relative
    // to the scene's baseHue) renders it essentially as authored. Unknown key →
    // leave the backdrop as-is rather than blanking it.
    const scene = BACKGROUND_SCENES.find((s) => s.key === preset.scene);
    setValues((prev) => ({
      ...prev,
      accentHue: preset.theme.accentHue,
      accentSat: preset.theme.accentSat,
      baseHue: preset.theme.baseHue,
      baseSat: preset.theme.baseSat,
      fontFamily: preset.typography.fontFamily,
      numericStyle: preset.typography.numericStyle,
      radius: preset.appearance.radius,
      borderStrength: preset.appearance.borderStrength,
      surfaceOpacity: preset.appearance.surfaceOpacity,
      density: preset.appearance.density,
      elevation: preset.appearance.elevation,
      ...(scene
        ? { bgType: "unicorn" as const, bgProjectId: scene.projectId }
        : null),
    }));
  }, []);

  const apply = useCallback((next: DashboardSpec) => {
    setValues(cosmeticsFromSpec(next));
  }, []);

  // Unlike the other cosmetics, currency must also follow the `spec` PROP: the
  // host can swap in a different board (the dashboard switcher does), and the
  // per-item roots read the code from a ref, so nothing else would notice.
  // A local edit is unaffected — the prop's value hasn't changed, so this
  // doesn't re-run.
  const specCurrencyCode = spec.currency.code;
  useEffect(() => {
    set("currencyCode", specCurrencyCode);
  }, [specCurrencyCode, set]);

  // The preset whose every owned value matches the live state, if any, so its
  // chip reads as selected (and drifts to none once a slider moves).
  const activePresetKey = useMemo(
    () =>
      THEME_PRESETS.find(
        (p) =>
          p.theme.accentHue === values.accentHue &&
          p.theme.accentSat === values.accentSat &&
          p.theme.baseHue === values.baseHue &&
          p.theme.baseSat === values.baseSat &&
          p.typography.fontFamily === values.fontFamily &&
          p.typography.numericStyle === values.numericStyle &&
          p.appearance.radius === values.radius &&
          p.appearance.borderStrength === values.borderStrength &&
          p.appearance.surfaceOpacity === values.surfaceOpacity &&
          p.appearance.density === values.density &&
          p.appearance.elevation === values.elevation &&
          // A preset now owns the backdrop too, so a different scene (or a
          // non-scene background) counts as drifting off it.
          values.bgType === "unicorn" &&
          BACKGROUND_SCENES.find((s) => s.key === p.scene)?.projectId ===
            values.bgProjectId,
      )?.key ?? null,
    [values],
  );

  const styleVars = useMemo<CSSProperties>(
    () => ({
      // Colour identity — accent drives every accent in FRAME_CSS; base
      // tints the dark card surface itself.
      ["--zf-accent-hue" as string]: values.accentHue,
      ["--zf-accent-sat" as string]: `${values.accentSat}%`,
      ["--zf-base-hue" as string]: values.baseHue,
      ["--zf-base-sat" as string]: `${values.baseSat}%`,
      // Surface mode — shared helper (same source the renderer uses, so the
      // customise preview never drifts from the served runtime). FRAME_CSS
      // reads these four lightness vars to flip ink + card surface.
      ...surfaceModeVars(values.surface),
      // Semantic gain/loss colours — frames' UP_COLOR/DOWN_COLOR resolve these.
      ["--zf-up" as string]: values.upColor,
      ["--zf-down" as string]: values.downColor,
      // Typography — family routes through --font-dmsans, numeric sets digit
      // spacing; both cascade into every card via FRAME_CSS.
      ["--zf-font-family" as string]: FONT_FAMILY_STACKS[values.fontFamily],
      ["--zf-numeric" as string]: NUMERIC_VARIANTS[values.numericStyle],
      // Card surface treatment — each cascades into every card via FRAME_CSS.
      ["--zf-frame-radius" as string]: `${values.radius}px`,
      ["--zf-border-alpha" as string]: values.borderStrength,
      ["--zf-surface-opacity" as string]: values.surfaceOpacity,
      ["--zf-density" as string]: values.density,
      ["--zf-elevation" as string]: values.elevation,
      // Grid geometry — horizontal board inset; pads .zf-editor-grid so the
      // GridStack element (positioned in % of its own width) reflows live.
      ["--zf-pad-x" as string]: `${values.paddingX}px`,
    }),
    [values],
  );

  const slices = useMemo<LiveCosmetics>(
    () => ({
      grid: {
        ...spec.grid,
        gap: values.gap,
        paddingX: values.paddingX,
        mode: values.mode,
        columns: values.columns,
        rowHeight: values.rowHeight,
      },
      // Built off spec.background so scale/dpi (no UI knob) ride along.
      background: {
        ...spec.background,
        type: values.bgType,
        projectId: values.bgProjectId,
        opacity: values.bgOpacity,
        color: values.bgColor,
        gradientFrom: values.bgGradFrom,
        gradientTo: values.bgGradTo,
        gradientAngle: values.bgGradAngle,
        imageUrl: values.bgImageUrl || undefined,
        imageFit: values.bgImageFit,
        imageBlur: values.bgImageBlur,
        overlayOpacity: values.bgOverlayOpacity,
      },
      theme: {
        ...spec.theme,
        accentHue: values.accentHue,
        accentSat: values.accentSat,
        baseHue: values.baseHue,
        baseSat: values.baseSat,
        upColor: values.upColor,
        downColor: values.downColor,
        surface: values.surface,
      },
      typography: {
        ...spec.typography,
        fontFamily: values.fontFamily,
        numericStyle: values.numericStyle,
        scale: values.fontScale,
      },
      appearance: {
        ...spec.appearance,
        radius: values.radius,
        borderStrength: values.borderStrength,
        surfaceOpacity: values.surfaceOpacity,
        density: values.density,
        elevation: values.elevation,
      },
      currency: { ...spec.currency, code: values.currencyCode },
    }),
    [spec, values],
  );

  // Chrome the editor doesn't own has to follow the sliders live: the page
  // header and the `:root`-scoped chart tokens, the root font size (chart text
  // is rem-based, so only the root font size scales it), the ticker tape's
  // --zf-up/--zf-down, the full-bleed backdrop, and the centred max-width that
  // flow-horizontal drops. All of that sits ABOVE .zf-editor, which is why one
  // report up beats eight — this used to be eight separate callbacks and eight
  // effects, and every new cosmetic meant remembering to add a ninth.
  useEffect(() => {
    onLiveChange?.(slices);
  }, [slices, onLiveChange]);
  // Reported through a ref so this cleanup fires ONLY on unmount: hanging it off
  // the effect above would flash `null` at the host between every slider step
  // and the value replacing it.
  //
  // Losing the editor mid-session (the desktop gate narrows past 1024px) used to
  // strand the page on the abandoned edit's cosmetics — accent hue, font scale,
  // gain/loss colours and the backdrop all stayed on values the board itself had
  // just reverted, until a reload. The host treats null as "use the saved spec".
  const onLiveChangeRef = useRef(onLiveChange);
  onLiveChangeRef.current = onLiveChange;
  useEffect(() => () => onLiveChangeRef.current?.(null), []);

  return {
    values,
    set,
    reset,
    isDefault,
    applyPreset,
    activePresetKey,
    styleVars,
    slices,
    apply,
  };
}
