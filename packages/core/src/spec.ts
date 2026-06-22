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
 * it; the renderer/editor apply it as the `--zf-accent-hue` / `--zf-accent-sat`
 * CSS vars, which the chrome stylesheet (frame-content's FRAME_CSS) and the
 * chart highlight token derive every accent color from. Rotating the hue (and
 * dialling the saturation) re-tints the whole brand — card rims, title dots,
 * chart highlights, loading states — while leaving semantic up/down (green/red),
 * asset logos, and explicit per-frame chart colors untouched. Card *surface*
 * treatment (corners, border, opacity, density, shadow) lives separately in
 * `appearance`.
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
  })
  .describe("Dashboard-wide color identity (accent hue + saturation).");

export type DashboardTheme = z.infer<typeof ThemeSchema>;

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
 * Three cosmetic groups, by fault line: `grid` is geometry (cell layout),
 * `theme` is the accent color, and `appearance` is per-card surface treatment.
 * A `z.preprocess` migrates legacy specs where `radius` lived under `grid`
 * (it now belongs to `appearance`) so older `dashboard.json` files keep loading.
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
    theme: ThemeSchema.default({ accentHue: 242, accentSat: 90 }),
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
