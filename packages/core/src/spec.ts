import { z } from "zod";

export const GridPositionSchema = z.object({
  x: z.number().int().min(0).describe("Column offset, 0-based"),
  y: z.number().int().min(0).describe("Row offset, 0-based"),
  w: z.number().int().min(1).describe("Width in grid columns"),
  h: z.number().int().min(1).describe("Height in grid rows"),
});

export const FrameInstanceSchema = z.object({
  id: z.string().describe("Unique instance id within the dashboard"),
  frame: z.string().describe("Name of a registered frame"),
  title: z
    .string()
    .optional()
    .describe(
      'Card title shown in the frame\'s chrome. Overrides the default (the frame type name) — set a meaningful per-instance label, e.g. the ticker on a price-chart ("TSLA"). Ignored by chrome-less frames like heading.',
    ),
  position: GridPositionSchema,
  config: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      "Frame config; validated against the frame's own schema at render time",
    ),
});

/**
 * Background rendered behind every frame. The spec only declares *what*
 * background to show; the host decides *how* to render it — the same split as
 * providers. Keeps the heavy/animated engine out of the spec and out of the
 * React-free tooling path.
 */
export const BackgroundSchema = z
  .object({
    type: z
      .enum(["none", "gradient", "unicorn"])
      .default("gradient")
      .describe(
        "Background style: 'gradient' (built-in dark glow), 'unicorn' (animated Unicorn Studio scene), or 'none'.",
      ),
    projectId: z
      .string()
      .optional()
      .describe(
        "Unicorn Studio public project id — required when type is 'unicorn'.",
      ),
    scale: z
      .number()
      .min(0.1)
      .max(2)
      .default(1)
      .describe("Unicorn scene render scale."),
    dpi: z
      .number()
      .min(0.5)
      .max(3)
      .default(1.5)
      .describe("Unicorn scene device-pixel-ratio cap (perf vs sharpness)."),
    opacity: z
      .number()
      .min(0)
      .max(1)
      .default(0.16)
      .describe(
        "Opacity of the unicorn scene (0–1). Keep moderate (~0.15) so the animation reads as a living backdrop in the gutters without competing with the (opaque) dashboard cards.",
      ),
  })
  .describe("Visual background rendered behind the whole dashboard.");

export type DashboardBackground = z.infer<typeof BackgroundSchema>;

/**
 * Dashboard-wide *color* identity. Like `background`, the spec only *declares*
 * it; the renderer/editor apply it as the `--zf-accent-*` / `--zf-base-*` CSS
 * vars, which the chrome stylesheet (frame-content's FRAME_CSS) and the chart
 * highlight token derive every color from. `accentHue`/`accentSat` rotate the
 * brand accent (card rims, title dots, chart highlights, loading states);
 * `baseHue`/`baseSat` tint the dark card *surface* itself (warm it, cool it, or
 * desaturate it toward pure black) without leaving dark mode. Both leave
 * semantic up/down (green/red), asset logos, and explicit per-frame chart colors
 * untouched. Card *surface treatment* — corners, border, opacity, density,
 * shadow — lives separately in `appearance`; this group is colour only.
 */
export const ThemeSchema = z
  .object({
    accentHue: z
      .number()
      .int()
      .min(0)
      .max(360)
      .default(242)
      .describe(
        "Brand accent hue in degrees on the HSL color wheel (0–360). Rotates the dashboard's accent — card rims, title dots, chart highlights, loading states — across the spectrum. 242 is the default zframes indigo; rough anchors: 0 red, 35 orange, 50 amber, 150 green, 190 teal, 210 blue, 280 violet, 330 pink. Semantic up/down green/red, asset logos, and per-frame chart colors stay fixed.",
      ),
    accentSat: z
      .number()
      .min(0)
      .max(100)
      .default(90)
      .describe(
        "Accent saturation as an HSL percentage (0–100). 90 is the default vivid zframes accent; lower it for muted/pastel rims and dots, 0 for a near-grayscale monochrome accent. Pairs with accentHue — hue picks the color, saturation picks how vivid it is.",
      ),
    baseHue: z
      .number()
      .int()
      .min(0)
      .max(360)
      .default(233)
      .describe(
        "Hue of the dark card surface itself, in degrees (0–360). 233 is the default near-black indigo-navy; rotate it to re-temperature every card — e.g. 30 warms toward charcoal-brown, 150 toward deep forest, 210 toward cool slate. The surface stays dark (lightness is fixed); only its tint moves. Independent of accentHue, which only colours rims/highlights.",
      ),
    baseSat: z
      .number()
      .min(0)
      .max(100)
      .default(20)
      .describe(
        "Saturation of the dark card surface as an HSL percentage (0–100). 20 is the default subtle navy tint; raise it for a richer coloured-black surface, drop it toward 0 for a neutral graphite/black with no colour cast. Pairs with baseHue.",
      ),
  })
  .describe(
    "Dashboard-wide colour identity — accent (rims/highlights) and the dark card-surface tint (base).",
  );

export type DashboardTheme = z.infer<typeof ThemeSchema>;

/**
 * Dashboard-wide *typography*. Same declare-vs-render split as the rest: the
 * spec carries the choice; the renderer/editor map it to the `--zf-font-family`
 * and `--zf-numeric` CSS vars that FRAME_CSS — and the chart text utilities, via
 * the `--font-dmsans` token — read. Every default reproduces the original DM
 * Sans look, so an absent/default `typography` is a visual no-op.
 */
export const TypographySchema = z
  .object({
    fontFamily: z
      .enum(["sans", "mono", "serif"])
      .default("sans")
      .describe(
        "Type family for all dashboard text. 'sans' is the default DM Sans (clean, modern); 'mono' switches to a monospaced system stack (a Bloomberg/terminal feel, numbers in fixed columns); 'serif' uses a system serif (editorial). Affects card titles, labels, and readouts alike.",
      ),
    numericStyle: z
      .enum(["proportional", "tabular"])
      .default("proportional")
      .describe(
        "How digits are spaced everywhere on the dashboard. 'proportional' is the default (natural widths); 'tabular' forces fixed-width figures (font-variant-numeric: tabular-nums) so live prices and tickers stop shifting sideways as digits change — recommended for number-dense dashboards. Hero stat numerals are always tabular regardless.",
      ),
    scale: z
      .number()
      .min(0.85)
      .max(1.25)
      .default(1)
      .describe(
        "Global text-size multiplier (0.85–1.25). 1 is the default. Scales all dashboard text together by setting the root font size, so chart labels, readouts, and titles grow or shrink as one — raise it for legibility on a large display, lower it to pack more in. Distinct from appearance.density, which scales card padding, not text. Grid cell heights are in pixels and stay fixed, so text can overflow a small card at high scale.",
      ),
  })
  .describe(
    "Dashboard-wide typography — font family, numeric digit style, and global text scale.",
  );

export type DashboardTypography = z.infer<typeof TypographySchema>;

/**
 * CSS `font-family` stack for each `typography.fontFamily` choice. Set as
 * `--zf-font-family` inline on the dashboard container by the renderer/editor;
 * the `.zf-grid` / `.zf-editor` rules then redefine `--font-dmsans` from it (a
 * :root indirection can't work — a custom property's var() resolves where it's
 * declared), so this drives every chart utility and frame title at once. 'sans'
 * restates the DM Sans default (an explicit no-op); 'mono'/'serif' use keyless
 * system stacks — no extra web-font load.
 */
export const FONT_FAMILY_STACKS: Record<
  DashboardTypography["fontFamily"],
  string
> = {
  sans: '"DM Sans", sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
};

/**
 * CSS `font-variant-numeric` value for each `typography.numericStyle` choice,
 * set as `--zf-numeric`. 'proportional' resolves to `normal` (the no-op default).
 */
export const NUMERIC_VARIANTS: Record<
  DashboardTypography["numericStyle"],
  string
> = {
  proportional: "normal",
  tabular: "tabular-nums",
};

/**
 * Card *surface* treatment — how each frame card looks, independent of its
 * accent color (`theme`) and the grid geometry (`grid`). Same declare-vs-render
 * split as the others: the spec only carries the numbers; the renderer/editor
 * map them to `--zf-*` CSS vars that FRAME_CSS reads. Every default reproduces
 * the original card look, so an absent/default `appearance` is a visual no-op.
 */
export const AppearanceSchema = z
  .object({
    radius: z
      .number()
      .min(0)
      .default(18)
      .describe(
        "Frame corner radius in pixels, applied to every card via --zf-frame-radius. 0 squares the corners; the editor's Appearance rail exposes this as a slider.",
      ),
    borderStrength: z
      .number()
      .min(0)
      .max(1)
      .default(0.22)
      .describe(
        "Opacity of each card's accent rim (0–1) via --zf-border-alpha. 0 = borderless flat cards, 1 = a solid outlined rim; 0.22 is the default soft edge. Hover lifts it a notch automatically.",
      ),
    surfaceOpacity: z
      .number()
      .min(0.3)
      .max(1)
      .default(1)
      .describe(
        "Opacity of the card surface (0.3–1) via --zf-surface-opacity. 1 = opaque cards (default); lower it toward 0.5 for frosted/glassy cards that let the dashboard background show through. Kept ≥0.3 so card content stays legible.",
      ),
    density: z
      .number()
      .min(0.6)
      .max(1.4)
      .default(1)
      .describe(
        "Card padding scale (0.6–1.4) via --zf-density. 1 = the comfortable default; <1 tightens padding for information-dense dashboards, >1 gives roomier breathing space.",
      ),
    elevation: z
      .number()
      .min(0)
      .max(2)
      .default(1)
      .describe(
        "Card shadow depth (0–2) via --zf-elevation. 0 = flat (no drop shadow), 1 = the default resting shadow, 2 = a heavier floating lift. Scales the card's drop shadow only.",
      ),
  })
  .describe(
    "Card surface treatment — corners, border, opacity, padding density, and shadow depth. Distinct from `grid` (geometry) and `theme` (accent color).",
  );

export type DashboardAppearance = z.infer<typeof AppearanceSchema>;

/**
 * The dashboard spec is the artifact a generating agent emits: plain JSON,
 * diffable, lives in git. Invalid specs fail loudly per frame so the agent
 * can read the errors and self-correct.
 *
 * Cosmetic groups, by fault line: `grid` is geometry (cell layout), `theme` is
 * colour (accent + the card-surface tint), `typography` is the type family +
 * numeric style, and `appearance` is per-card surface treatment. A `z.preprocess`
 * migrates legacy specs where `radius` lived under `grid` (it now belongs to
 * `appearance`) so older `dashboard.json` files keep loading.
 */
export const DashboardSpecSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const r = raw as Record<string, unknown>;
    const grid = r.grid;
    if (grid && typeof grid === "object" && "radius" in grid) {
      const { radius, ...restGrid } = grid as Record<string, unknown>;
      // Hoist the legacy grid.radius into appearance; an explicit
      // appearance.radius (new shape) still wins.
      return {
        ...r,
        grid: restGrid,
        appearance: {
          radius,
          ...((r.appearance as Record<string, unknown>) ?? {}),
        },
      };
    }
    return raw;
  },
  z.object({
    version: z.coerce
      .string()
      .default("1.0.0")
      .describe(
        'Spec version, a semver-style string like package.json\'s ("1.0.0"). A legacy numeric `1` from an older spec is coerced to "1".',
      ),
    title: z.string().describe("Dashboard name, like package.json's name."),
    author: z
      .string()
      .optional()
      .describe(
        'Who made this dashboard — a free-form credit, like package.json\'s author ("You" or "You <you@example.com>"). Optional.',
      ),
    grid: z
      .object({
        columns: z.number().int().min(1).default(12),
        rowHeight: z.number().min(8).default(96),
        gap: z
          .number()
          .min(0)
          .default(12)
          .describe(
            "Pixels of space between frames (the grid gutter). 0 makes the cards flush; the editor's Layout rail exposes this as a slider.",
          ),
      })
      .default({ columns: 12, rowHeight: 96, gap: 12 }),
    background: BackgroundSchema.default({
      type: "gradient",
      scale: 1,
      dpi: 1.5,
      opacity: 0.16,
    }),
    theme: ThemeSchema.default({
      accentHue: 242,
      accentSat: 90,
      baseHue: 233,
      baseSat: 20,
    }),
    typography: TypographySchema.default({
      fontFamily: "sans",
      numericStyle: "proportional",
      scale: 1,
    }),
    appearance: AppearanceSchema.default({
      radius: 18,
      borderStrength: 0.22,
      surfaceOpacity: 1,
      density: 1,
      elevation: 1,
    }),
    frames: z.array(FrameInstanceSchema),
  }),
);

export type GridPosition = z.infer<typeof GridPositionSchema>;
export type FrameInstance = z.infer<typeof FrameInstanceSchema>;
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
