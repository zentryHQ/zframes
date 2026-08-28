import type { DashboardRow } from "@/app/lib/db/schema";

/**
 * The shape every board LIST needs — the landing card stack, the gallery grid —
 * and nothing more.
 *
 * Deliberately excludes `spec`. A dashboard spec is tens of kilobytes of jsonb;
 * the landing page shows three boards and needs only their labels, because the
 * board itself is rendered by an `/embed/[id]` iframe that fetches its own spec.
 * Serialising three full specs into the client payload to read
 * `spec.frames.length` off them is exactly the kind of thing that happens by
 * accident when a server component hands a DB row straight to a client one.
 */
export type BoardSummary = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  frameCount: number;
  // Public like count. Lives HERE rather than being bolted onto the gallery route
  // BECAUSE both gallery sections need it: curated boards are likeable too, and a
  // card that silently omitted the number would make the popularity sort look
  // arbitrary on half the grid. One integer, so no payload argument against it.
  likes: number;
};

export function toBoardSummary(row: DashboardRow): BoardSummary {
  return {
    id: row.id,
    title: row.title,
    // Community boards have no description (there is no field for one in the
    // publish UI); the empty string keeps the prop non-optional for consumers.
    description: row.description ?? "",
    tags: row.tags,
    frameCount: framesOf(row.spec).length,
    likes: row.likes,
  };
}

/**
 * A board summary PLUS the bare geometry its gallery thumbnail draws from —
 * `{id, frame, position}` per card and nothing else.
 *
 * The gallery used to read `spec.frames` directly off the curated module to draw a
 * true-to-life thumbnail, while community boards got a synthesised layout. Keeping
 * that difference after the move meant either shipping whole specs to the client
 * (tens of KB per board, for four fields each) or downgrading the curated
 * thumbnails to synthetic ones. This is the third option: project the geometry
 * server-side, so the real layout survives at a fraction of the payload.
 *
 * List queries build this shape in SQL (see the projections in dashboards.ts —
 * kept in sync with the mappers below); the mappers remain for callers that
 * already hold a full row, e.g. the resolveDashboard path.
 */
export type BoardListing = BoardSummary & {
  layout: { id: string; frame: string; position: FramePosition }[];
};

type FramePosition = { x: number; y: number; w: number; h: number };

function framesOf(spec: unknown): unknown[] {
  const frames = (spec as { frames?: unknown[] })?.frames;
  return Array.isArray(frames) ? frames : [];
}

export function toBoardListing(row: DashboardRow): BoardListing {
  return {
    ...toBoardSummary(row),
    layout: framesOf(row.spec).flatMap((f) => {
      const frame = f as { id?: unknown; frame?: unknown; position?: unknown };
      const p = frame.position as Partial<FramePosition> | undefined;
      if (
        typeof frame.id !== "string" ||
        typeof frame.frame !== "string" ||
        typeof p?.x !== "number" ||
        typeof p?.y !== "number" ||
        typeof p?.w !== "number" ||
        typeof p?.h !== "number"
      )
        return [];
      return [
        {
          id: frame.id,
          frame: frame.frame,
          position: { x: p.x, y: p.y, w: p.w, h: p.h },
        },
      ];
    }),
  };
}
