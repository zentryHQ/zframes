import { z } from "zod";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import type { AnyFrameDefinition, FrameLayout } from "@zframes/core";
import type { StoryGlobals } from "../.storybook/preview";
import { FrameCanvas } from "./frame-canvas";
import { curated } from "./curated";
import type { MockMode } from "@zframes/frames/testing";

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

/**
 * Every grid span the frame can legally occupy, as GridStack would allow it:
 * width from `layout.minW` to `layout.maxW` (clamped to the board's columns),
 * height from `layout.minH` to `layout.maxH`. Those four are exactly the
 * attributes the editor writes as `gs-min-w`/`gs-max-w`/`gs-min-h`/`gs-max-h`,
 * so this enumerates the real resize envelope — plus one step below each floor,
 * marked "below min", which is where the frame is expected to misbehave.
 *
 * Ordered by height then width, so the grid reads as one row per row-count.
 */
function sizesFor(
  frame: AnyFrameDefinition,
): { w: number; h: number; below: boolean }[] {
  const l = frame.layout ?? FALLBACK_LAYOUT;
  const minW = Math.max(1, l.minW ?? 1);
  const maxW = Math.min(l.maxW ?? BOARD_COLUMNS, BOARD_COLUMNS);
  const minH = Math.max(1, l.minH ?? 1);
  const maxH = l.maxH ?? Math.max(l.h, OPEN_MAX_H);

  // One step below each floor as well. The bounds exist BECAUSE the frame
  // misbehaves just under them — content clipped, a chart squeezed past its
  // axis — and a story that starts exactly at the floor is the one view that
  // can never show you that. These cells are what you look at while fixing the
  // frame, and what tells you the floor can come down once you have.
  const fromW = Math.max(1, minW - 1);
  const fromH = Math.max(1, minH - 1);

  const out: { w: number; h: number; below: boolean }[] = [];
  for (let h = fromH; h <= maxH; h++) {
    for (let w = fromW; w <= maxW; w++)
      out.push({ w, h, below: w < minW || h < minH });
  }
  // A frame whose min exceeds its max (or which sits outside the board) would
  // otherwise render nothing at all; fall back to its declared default span.
  if (out.length === 0) out.push({ w: l.w, h: l.h, below: false });
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
    const sizes = sizesFor(frame);
    return (
      <div className="sb-sizes">
        {sizes.map((s) => (
          <div className="sb-cell sb-size-cell" key={`${s.w}x${s.h}`}>
            <div
              className="sb-cell-label"
              style={s.below ? { color: "#f5a524" } : undefined}
            >
              {s.w}&times;{s.h}
              {s.below ? " · below min" : ""}
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
