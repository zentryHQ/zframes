import { type CSSProperties } from "react";
import type { FrameRegistry } from "./frame";
import { FRAME_CSS, FrameContent } from "./frame-content";
import {
  FONT_FAMILY_STACKS,
  NUMERIC_VARIANTS,
  type DashboardSpec,
  type FrameInstance,
} from "./spec";

// Placement ships as CSS vars (not direct grid-column/grid-row) so the
// stylesheet's media queries can override it — inline styles would win over a
// media rule and lock the layout to the desktop grid on phones.
//
// flow-vertical uses the frame's `position`. flow-horizontal uses its own
// `layouts["flow-horizontal"]` when present (explicit placement, independent of
// the vertical layout); a frame with no horizontal layout OMITS its start lines
// so the `auto` var-fallback lets the grid auto-pack it by w×h size (see
// FRAME_CSS) — the fallback for un-edited / agent-generated specs. Row span is
// clamped to the band count so a tall frame can't exceed the bounded board.
function positionStyle(
  instance: FrameInstance,
  index: number,
  horizontal: boolean,
  rows: number,
  cols: number,
): CSSProperties {
  // The tablet tier (641-1023px in FRAME_CSS) reflows the board to two columns:
  // a frame that spanned at least half the design grid takes both columns, the
  // rest take one. Computed here so the CSS just reads --zf-col-span-sm.
  const enter = {
    ["--zf-enter-i" as string]: index,
    ["--zf-col-span-sm" as string]: instance.position.w >= cols / 2 ? 2 : 1,
  };
  if (horizontal) {
    const hl = instance.layouts?.["flow-horizontal"];
    if (hl) {
      return {
        ...enter,
        ["--zf-col-start" as string]: hl.x + 1,
        ["--zf-col-span" as string]: hl.w,
        ["--zf-row-start" as string]: hl.y + 1,
        ["--zf-row-span" as string]: Math.min(hl.h, rows),
      };
    }
    // No stored horizontal layout → auto-pack: omit start lines (CSS falls back
    // to `auto`), keep the vertical w/h as the footprint.
    return {
      ...enter,
      ["--zf-col-span" as string]: instance.position.w,
      ["--zf-row-span" as string]: Math.min(instance.position.h, rows),
    };
  }
  const { x, y, w, h } = instance.position;
  return {
    ...enter,
    ["--zf-col-start" as string]: x + 1,
    ["--zf-col-span" as string]: w,
    ["--zf-row-start" as string]: y + 1,
    ["--zf-row-span" as string]: h,
  };
}

export function DashboardRenderer({
  spec,
  registry,
}: {
  spec: DashboardSpec;
  registry: FrameRegistry;
}) {
  const horizontal = spec.grid.mode === "flow-horizontal";
  return (
    <>
      <style>{FRAME_CSS}</style>
      <div
        className={horizontal ? "zf-grid zf-flow-horizontal" : "zf-grid"}
        style={{
          ["--zf-cols" as string]: spec.grid.columns,
          ["--zf-row-h" as string]: `${spec.grid.rowHeight}px`,
          ["--zf-h-rows" as string]: spec.grid.rows,
          ["--zf-gap" as string]: `${spec.grid.gap}px`,
          // Colour identity (spec.theme): accent hue+sat drive every accent in
          // FRAME_CSS (card rims, title dots, source links); base hue+sat tint
          // the dark card surface itself.
          ["--zf-accent-hue" as string]: spec.theme.accentHue,
          ["--zf-accent-sat" as string]: `${spec.theme.accentSat}%`,
          ["--zf-base-hue" as string]: spec.theme.baseHue,
          ["--zf-base-sat" as string]: `${spec.theme.baseSat}%`,
          // Semantic gain/loss colours (spec.theme): UP_COLOR/DOWN_COLOR in the
          // frames resolve these (with the green/red fallback).
          ["--zf-up" as string]: spec.theme.upColor,
          ["--zf-down" as string]: spec.theme.downColor,
          // Typography (spec.typography): family routes through --font-dmsans,
          // numeric style sets digit spacing.
          ["--zf-font-family" as string]:
            FONT_FAMILY_STACKS[spec.typography.fontFamily],
          ["--zf-numeric" as string]:
            NUMERIC_VARIANTS[spec.typography.numericStyle],
          // Card surface treatment (spec.appearance): corners, rim opacity,
          // surface translucency, padding density, shadow depth.
          ["--zf-frame-radius" as string]: `${spec.appearance.radius}px`,
          ["--zf-border-alpha" as string]: spec.appearance.borderStrength,
          ["--zf-surface-opacity" as string]: spec.appearance.surfaceOpacity,
          ["--zf-density" as string]: spec.appearance.density,
          ["--zf-elevation" as string]: spec.appearance.elevation,
        }}
      >
        {spec.frames.map((instance, index) => (
          <FrameContent
            key={instance.id}
            instance={instance}
            registry={registry}
            style={positionStyle(
              instance,
              index,
              horizontal,
              spec.grid.rows,
              spec.grid.columns,
            )}
          />
        ))}
      </div>
    </>
  );
}
