import { z } from "zod";
import { buildDefaultConfig } from "@zframes/core/editor-symbols";
import type { AnyFrameDefinition } from "@zframes/core";
import type { StoryGlobals } from "../.storybook/preview";
import { FrameCanvas } from "./frame-canvas";
import { curated } from "./curated";
import type { MockMode } from "./mock-provider";

type Render = (args: Record<string, unknown>, context: { globals: StoryGlobals }) => React.ReactElement;
type Variant = { label: string; config: Record<string, unknown> };

const VARIANT_CAP = 12;

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
export function argTypesFor(frame: AnyFrameDefinition): Record<string, unknown> {
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
          ? { control: { type: "range", min: shape.minimum, max: shape.maximum, step: 1 } }
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
        out.push({ label: `${key}: ${String(value)}`, config: { ...base, [key]: value } });
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
        out.push({ label: `${key}: ${value}`, config: { ...base, [key]: value } });
      }
    }
  }

  if (out.length === 0) out.push({ label: "default", config: base });
  return out.slice(0, VARIANT_CAP);
}

/** The single Default canvas — args (editable via Controls) drive the config. */
export function canvasRender(frame: AnyFrameDefinition): Render {
  return (args, context) => (
    <FrameCanvas frame={frame} config={args} mode="normal" globals={context.globals} />
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="sb-grid">{children}</div>;
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
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
          <FrameCanvas frame={frame} config={v.config} mode="normal" globals={context.globals} />
        </Cell>
      ))}
    </Grid>
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
          <FrameCanvas frame={frame} config={base} mode={s.mode} globals={context.globals} />
        </Cell>
      ))}
    </Grid>
  );
}
