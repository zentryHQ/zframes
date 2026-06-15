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
      .default(0.06)
      .describe(
        "Opacity of the unicorn scene (0–1). Keep low (~0.05) so the animation stays a faint backdrop and never competes with the dashboard content.",
      ),
  })
  .describe("Visual background rendered behind the whole dashboard.");

export type DashboardBackground = z.infer<typeof BackgroundSchema>;

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
    opacity: 0.06,
  }),
  frames: z.array(FrameInstanceSchema),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;
export type FrameInstance = z.infer<typeof FrameInstanceSchema>;
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
