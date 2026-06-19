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
  featured: z
    .boolean()
    .default(false)
    .describe(
      "Mark as the dashboard's hero frame — the renderer gives it an accent rim and glow. Use for the single centerpiece, usually the main price-chart.",
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
 * Dashboard-wide theming. Like `background`, the spec only *declares* it; the
 * renderer/editor apply it as the `--zf-accent-hue` CSS var, which the chrome
 * stylesheet (frame-content's FRAME_CSS) and the chart highlight token derive
 * every accent color from. Rotating the hue re-tints the whole brand — card
 * rims, title dots, the hero-frame glow, chart highlights, loading states —
 * while leaving semantic up/down (green/red), asset logos, and explicit
 * per-frame chart colors untouched.
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
        "Brand accent hue in degrees on the HSL color wheel (0–360). Rotates the dashboard's accent — card rims, title dots, the hero-frame glow, chart highlights, loading states — across the spectrum. 242 is the default zframes indigo; rough anchors: 0 red, 35 orange, 50 amber, 150 green, 190 teal, 210 blue, 280 violet, 330 pink. Semantic up/down green/red, asset logos, and per-frame chart colors stay fixed.",
      ),
  })
  .describe("Dashboard-wide theming (accent color).");

export type DashboardTheme = z.infer<typeof ThemeSchema>;

/**
 * The dashboard spec is the artifact a generating agent emits: plain JSON,
 * diffable, lives in git. Invalid specs fail loudly per frame so the agent
 * can read the errors and self-correct.
 */
export const DashboardSpecSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  grid: z
    .object({
      columns: z.number().int().min(1).default(12),
      rowHeight: z.number().min(8).default(96),
      gap: z.number().min(0).default(12),
    })
    .default({ columns: 12, rowHeight: 96, gap: 12 }),
  background: BackgroundSchema.default({
    type: "gradient",
    scale: 1,
    dpi: 1.5,
    opacity: 0.16,
  }),
  theme: ThemeSchema.default({ accentHue: 242 }),
  frames: z.array(FrameInstanceSchema),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;
export type FrameInstance = z.infer<typeof FrameInstanceSchema>;
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
