import type { AnyFrameDefinition } from "@zframes/spec/frame";
import type {
  DashboardSpec,
  FrameInstance,
  GridPosition,
} from "@zframes/spec/spec";

export type LayoutMode = DashboardSpec["grid"]["mode"];

/**
 * The inner-grid geometry a container frame declares in its config. Read off the
 * *validated* config so a group whose config is broken falls back to a usable
 * grid rather than producing `NaN` column counts — the group still renders its
 * own error card through the normal path, but the editor needs numbers either
 * way to build the nested GridStack.
 */
export interface ContainerGeometry {
  columns: number;
  rows: number;
  gap: number;
}

const CONTAINER_FALLBACK: ContainerGeometry = { columns: 2, rows: 2, gap: 8 };

/**
 * A container frame's inner geometry, or `null` when the frame isn't a container
 * at all — which is the editor's one test for "does this item hold a subgrid".
 */
export function containerGeometry(
  def: AnyFrameDefinition | undefined,
  config: unknown,
): ContainerGeometry | null {
  if (!def?.container) return null;
  const parsed = def.schema.safeParse(config ?? {});
  if (!parsed.success) return CONTAINER_FALLBACK;
  const data = parsed.data as Partial<ContainerGeometry>;
  return {
    columns: data.columns ?? CONTAINER_FALLBACK.columns,
    rows: data.rows ?? CONTAINER_FALLBACK.rows,
    gap: data.gap ?? CONTAINER_FALLBACK.gap,
  };
}

/**
 * Pixel height of one row of a group's inner grid.
 *
 * GridStack's nested grids need a **px** `cellHeight` (its own docs say `%`
 * values don't work), so the children only fill their group if we compute it from
 * the group's measured content box and re-apply it whenever the group is
 * resized. `margin` is `gap / 2` per side, so each of the `rows` tracks carries a
 * full `gap` of margin — subtract that before dividing, or the children overflow
 * their group by `gap * rows`.
 */
export function subCellPx(
  contentHeightPx: number,
  rows: number,
  gap: number,
): number {
  const usable = contentHeightPx - rows * gap;
  return Math.max(24, Math.floor(usable / Math.max(1, rows)));
}

// flow-horizontal runs GridStack as a wide, height-bounded grid: the column
// count is sized to the content (colsForHorizontal) so the forced-wide element
// fits the frames with little trailing space, while maxRow/minRow lock it to
// spec.grid.rows bands. This is GridStack coerced out of its native vertical
// orientation — see the layout-modes plan.
const H_COLS_MIN = 24;

// The placement a frame uses in a given mode: its own per-mode override if
// present, else (flow-vertical) the canonical `position`. flow-horizontal with
// no override returns undefined → the caller seeds/packs it.
export function posFor(
  instance: FrameInstance,
  mode: LayoutMode,
): GridPosition | undefined {
  if (mode === "flow-horizontal") return instance.layouts?.["flow-horizontal"];
  return instance.position;
}

// How many columns the horizontal board needs to hold every frame across `rows`
// bands, with headroom for fragmentation + a few extra for future additions.
export function colsForHorizontal(
  frames: FrameInstance[],
  rows: number,
): number {
  const cells = frames.reduce(
    (sum, f) =>
      sum +
      Math.max(1, f.position.w) * Math.min(Math.max(1, f.position.h), rows),
    0,
  );
  return Math.max(H_COLS_MIN, Math.ceil((cells / rows) * 1.25) + 8);
}

// Fill in a flow-horizontal layout for any frame missing one, dense first-fit
// packed into `cols` × `rows` (scanning columns left→right, rows top→bottom).
// Frames that already have a horizontal layout keep it (and block those cells),
// so the seed only ever lays out the un-arranged frames — the tidy first-time
// arrangement a dashboard gets the first time it enters horizontal mode. With
// float:true on the grid, the seed is then freely drag-editable and preserved.
export function seedHorizontal(
  frames: FrameInstance[],
  cols: number,
  rows: number,
): FrameInstance[] {
  const taken = new Set<string>();
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++) {
        const c = x + i;
        const r = y + j;
        if (c >= 0 && r >= 0) taken.add(`${c},${r}`);
      }
  };
  const free = (x: number, y: number, w: number, h: number) => {
    if (x + w > cols || y + h > rows) return false;
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        if (taken.has(`${x + i},${y + j}`)) return false;
    return true;
  };
  for (const f of frames) {
    const hl = f.layouts?.["flow-horizontal"];
    if (hl) fill(hl.x, hl.y, hl.w, Math.min(hl.h, rows));
  }
  return frames.map((f) => {
    if (f.layouts?.["flow-horizontal"]) return f;
    const w = Math.min(Math.max(1, f.position.w), cols);
    const h = Math.min(Math.max(1, f.position.h), rows);
    let placed: GridPosition = { x: 0, y: 0, w, h };
    search: for (let c = 0; c <= cols - w; c++)
      for (let r = 0; r <= rows - h; r++)
        if (free(c, r, w, h)) {
          placed = { x: c, y: r, w, h };
          break search;
        }
    fill(placed.x, placed.y, placed.w, placed.h);
    return { ...f, layouts: { ...f.layouts, "flow-horizontal": placed } };
  });
}

/** Inline gear glyph for the per-frame edit button. That button lives in
 *  GridStack-owned DOM (built imperatively, like the delete ×), so it can't be a
 *  React <Settings/> — it's injected as markup. Mirrors lucide's settings icon. */
export const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
