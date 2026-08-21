import { z } from "zod";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import type { AnyFrameDefinition, FrameLayout } from "@zframes/core";
import type { StoryGlobals } from "../.storybook/preview";
import { FrameCanvas } from "./frame-canvas";
import { curated } from "./curated";
import type { MockMode } from "@zframes/provider-demo";

type Render = (
  args: Record<string, unknown>,
  context: { globals: StoryGlobals },
) => React.ReactElement;
type Variant = { label: string; config: Record<string, unknown> };

const VARIANT_CAP = 12;

/**
 * The board geometry every size is measured against: `DashboardSpecSchema`'s
 * default `grid.columns`. A frame can never be resized past it, so it's the
 * hard ceiling on width regardless of what the frame's own `layout.maxW` says.
 */
const BOARD_COLUMNS = 12;
/** Default span for a frame that declares no `layout` (mirrors FrameCanvas). */
const FALLBACK_LAYOUT: FrameLayout = { w: 4, h: 3 };
/**
 * Height ceiling for a frame that declares no `maxH`. GridStack imposes none
 * (a board grows downward forever), so the story picks a readable stopping
 * point rather than enumerating to infinity.
 */
const OPEN_MAX_H = 6;
/**
 * How far the out-of-bounds story will go past a height ceiling. A board really
 * does grow downward forever, so "one row over the ceiling" has no natural stop
 * — this is the same readable limit as OPEN_MAX_H, one row further on.
 */
const MAX_ROWS = OPEN_MAX_H + 2;
/** Upper bound on rendered cells — the full cross product can be large. */
const SIZE_CAP = 72;

function baseConfig(frame: AnyFrameDefinition): Record<string, unknown> {
  return curated[frame.name]?.base ?? buildDefaultConfig(frame);
}

/** The Default story's args — a valid, renderable config. */
export function baseArgs(frame: AnyFrameDefinition): Record<string, unknown> {
  return baseConfig(frame);
}

interface JsonShape {
  type?: string | string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonShape>;
}

function jsonSchema(frame: AnyFrameDefinition): JsonShape | null {
  try {
    return z.toJSONSchema(frame.schema, { io: "input" }) as JsonShape;
  } catch {
    return null;
  }
}

function isType(shape: JsonShape, t: string): boolean {
  return Array.isArray(shape.type) ? shape.type.includes(t) : shape.type === t;
}

/** Storybook Controls derived from the frame's Zod schema. */
export function argTypesFor(
  frame: AnyFrameDefinition,
): Record<string, unknown> {
  const schema = jsonSchema(frame);
  const props = schema?.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, shape] of Object.entries(props)) {
    if (Array.isArray(shape.enum) && shape.enum.length) {
      out[key] = { control: "select", options: shape.enum };
    } else if (isType(shape, "boolean")) {
      out[key] = { control: "boolean" };
    } else if (isType(shape, "number") || isType(shape, "integer")) {
      out[key] =
        shape.minimum != null && shape.maximum != null
          ? {
              control: {
                type: "range",
                min: shape.minimum,
                max: shape.maximum,
                step: 1,
              },
            }
          : { control: "number" };
    } else if (isType(shape, "string")) {
      out[key] = { control: "text" };
    } else {
      // arrays / objects — too structured for a simple control
      out[key] = { control: false };
    }
  }
  return out;
}

/** Every meaningful config variant: curated set first, then schema enum/booleans. */
function deriveVariants(frame: AnyFrameDefinition): Variant[] {
  const base = baseConfig(frame);
  const out: Variant[] = [...(curated[frame.name]?.variants ?? [])];

  const schema = jsonSchema(frame);
  for (const [key, shape] of Object.entries(schema?.properties ?? {})) {
    if (Array.isArray(shape.enum) && shape.enum.length > 1) {
      for (const value of shape.enum) {
        out.push({
          label: `${key}: ${String(value)}`,
          config: { ...base, [key]: value },
        });
      }
    } else if (isType(shape, "boolean")) {
      out.push({ label: `${key}: on`, config: { ...base, [key]: true } });
      out.push({ label: `${key}: off`, config: { ...base, [key]: false } });
    } else if (
      (isType(shape, "number") || isType(shape, "integer")) &&
      shape.minimum != null &&
      shape.maximum != null &&
      shape.maximum > shape.minimum
    ) {
      const mid = Math.round((shape.minimum + shape.maximum) / 2);
      for (const value of [shape.minimum, mid, shape.maximum]) {
        out.push({
          label: `${key}: ${value}`,
          config: { ...base, [key]: value },
        });
      }
    }
  }

  if (out.length === 0) out.push({ label: "default", config: base });
  return out.slice(0, VARIANT_CAP);
}

/** The single Default canvas — args (editable via Controls) drive the config. */
export function canvasRender(frame: AnyFrameDefinition): Render {
  return (args, context) => (
    <FrameCanvas
      frame={frame}
      config={args}
      mode="normal"
      globals={context.globals}
    />
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="sb-grid">{children}</div>;
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sb-cell">
      <div className="sb-cell-label">{label}</div>
      {children}
    </div>
  );
}

/** A grid of every config variant for the frame. */
export function variantsRender(frame: AnyFrameDefinition): Render {
  return (_args, context) => (
    <Grid>
      {deriveVariants(frame).map((v, i) => (
        <Cell key={`${v.label}-${i}`} label={v.label}>
          <FrameCanvas
            frame={frame}
            config={v.config}
            mode="normal"
            globals={context.globals}
          />
        </Cell>
      ))}
    </Grid>
  );
}

/** The frame's envelope, resolved against the board's real limits. */
function envelope(frame: AnyFrameDefinition) {
  const l = frame.layout ?? FALLBACK_LAYOUT;
  return {
    minW: Math.max(1, l.minW ?? 1),
    maxW: Math.min(l.maxW ?? BOARD_COLUMNS, BOARD_COLUMNS),
    minH: Math.max(1, l.minH ?? 1),
    maxH: l.maxH ?? Math.max(l.h, OPEN_MAX_H),
    l,
  };
}

/**
 * Every grid span the frame can LEGALLY occupy, exactly as GridStack allows it:
 * width from `layout.minW` to `layout.maxW` (clamped to the board's columns),
 * height from `layout.minH` to `layout.maxH`. Those four are the attributes the
 * editor writes as `gs-min-w`/`gs-max-w`/`gs-min-h`/`gs-max-h`, so this is the
 * real resize envelope and nothing else.
 *
 * Ordered by height then width, so the grid reads as one row per row-count.
 */
function validSizes(frame: AnyFrameDefinition): { w: number; h: number }[] {
  const { minW, maxW, minH, maxH, l } = envelope(frame);
  const out: { w: number; h: number }[] = [];
  for (let h = minH; h <= maxH; h++)
    for (let w = minW; w <= maxW; w++) out.push({ w, h });
  // A frame whose min exceeds its max (or which sits outside the board) would
  // otherwise render nothing at all; fall back to its declared default span.
  if (out.length === 0) out.push({ w: l.w, h: l.h });
  return out.slice(0, SIZE_CAP);
}

/**
 * The ring of spans just OUTSIDE the envelope — one step under each floor and
 * one step over each ceiling.
 *
 * Separate from the valid set on purpose: the two answer different questions.
 * "Does this frame hold up everywhere it is allowed to go" is a pass/fail sweep
 * you want uncluttered; "what is the bound actually protecting against" is the
 * evidence FOR the bound, and is the view you work in while fixing a frame — the
 * cell that clips is the one you can never see from inside the envelope.
 *
 * A span the board can't produce is left out: nothing exceeds 12 columns, so a
 * frame with `maxW: 12` has no over-wide case to show.
 */
function invalidSizes(
  frame: AnyFrameDefinition,
): { w: number; h: number; why: string }[] {
  const { minW, maxW, minH, maxH } = envelope(frame);
  const out: { w: number; h: number; why: string }[] = [];
  const seen = new Set<string>();
  const add = (w: number, h: number, why: string) => {
    if (w < 1 || h < 1 || w > BOARD_COLUMNS || h > MAX_ROWS) return;
    const key = `${w}x${h}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ w, h, why });
  };

  // Narrower than the floor, across the legal heights…
  if (minW > 1)
    for (let h = minH; h <= maxH; h++) add(minW - 1, h, "below minW");
  // …shorter than the floor, across the legal widths…
  if (minH > 1)
    for (let w = minW; w <= maxW; w++) add(w, minH - 1, "below minH");
  // …and the same one step past each ceiling, where the board can reach it.
  if (maxW < BOARD_COLUMNS)
    for (let h = minH; h <= maxH; h++) add(maxW + 1, h, "above maxW");
  if (maxH < MAX_ROWS)
    for (let w = minW; w <= maxW; w++) add(w, maxH + 1, "above maxH");

  return out.slice(0, SIZE_CAP);
}

/**
 * A board of the frame at every size it can be resized to. Cells are laid out
 * with flex rather than the fixed-column `.sb-grid`, because each canvas has an
 * intrinsic pixel width (`w` columns) and must not be squeezed out of it — a
 * story about sizing that resizes its own cells would prove nothing.
 */
export function sizesRender(frame: AnyFrameDefinition): Render {
  const base = baseConfig(frame);
  return (_args, context) => {
    const sizes = validSizes(frame);
    return (
      <div className="sb-sizes">
        {sizes.map((s) => (
          <div className="sb-cell sb-size-cell" key={`${s.w}x${s.h}`}>
            <div className="sb-cell-label">
              {s.w}&times;{s.h}
            </div>
            <FrameCanvas
              frame={frame}
              config={base}
              mode="normal"
              size={s}
              globals={context.globals}
            />
          </div>
        ))}
      </div>
    );
  };
}

/**
 * The frame at the spans its bounds forbid — the evidence FOR the envelope.
 *
 * Every cell here is expected to look wrong; that is the point. A frame is
 * finished when the damage is graceful (a list that scrolls, a chart that
 * shrinks) rather than silent (a row sliced through the middle, an axis pushed
 * out of the card). If a cell looks perfectly fine, the bound is too strict and
 * can come down — re-measure with `pnpm frames:size:probe` and see.
 *
 * These spans are reachable even though the editor forbids them: a hand-edited
 * `dashboard.json` can name any size, and the phone/tablet reflow can hand a
 * card less height than its floor no matter what `layout` says.
 */
export function outOfBoundsRender(frame: AnyFrameDefinition): Render {
  const base = baseConfig(frame);
  return (_args, context) => {
    const sizes = invalidSizes(frame);
    if (sizes.length === 0)
      return (
        <div className="sb-cell-label" style={{ padding: 16 }}>
          No out-of-bounds size exists for this frame on a {BOARD_COLUMNS}
          -column board — its envelope already covers everything the board can
          produce.
        </div>
      );
    return (
      <div className="sb-sizes">
        {sizes.map((s) => (
          <div className="sb-cell sb-size-cell" key={`${s.w}x${s.h}`}>
            <div className="sb-cell-label" style={{ color: "#f5a524" }}>
              {s.w}&times;{s.h} &middot; {s.why}
            </div>
            <FrameCanvas
              frame={frame}
              config={base}
              mode="normal"
              size={s}
              globals={context.globals}
            />
          </div>
        ))}
      </div>
    );
  };
}

/**
 * The frame against the REAL keyless providers — the one story that leaves the
 * mock behind. Non-deterministic by definition: it's for eyeballing how the
 * frame copes with real upstream data, never for visual regression.
 */
export function liveRender(frame: AnyFrameDefinition): Render {
  return (args, context) => (
    <FrameCanvas
      frame={frame}
      config={args}
      mode="live"
      globals={context.globals}
    />
  );
}

const STATES: { mode: MockMode; label: string }[] = [
  { mode: "normal", label: "normal" },
  { mode: "loading", label: "loading" },
  { mode: "empty", label: "empty" },
  { mode: "error", label: "error" },
];

/** A grid of the frame under each provider state. */
export function statesRender(frame: AnyFrameDefinition): Render {
  const base = baseConfig(frame);
  return (_args, context) => (
    <Grid>
      {STATES.map((s) => (
        <Cell key={s.mode} label={s.label}>
          <FrameCanvas
            frame={frame}
            config={base}
            mode={s.mode}
            globals={context.globals}
          />
        </Cell>
      ))}
    </Grid>
  );
}
