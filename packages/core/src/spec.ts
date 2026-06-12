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
  position: GridPositionSchema,
  config: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      "Frame config; validated against the frame's own schema at render time",
    ),
});

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
  frames: z.array(FrameInstanceSchema),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;
export type FrameInstance = z.infer<typeof FrameInstanceSchema>;
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
