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
// stylesheet's mobile media query can override it — inline styles would win
// over a media rule and lock the layout to the desktop grid on phones.
function positionStyle(instance: FrameInstance, index: number): CSSProperties {
  const { x, y, w, h } = instance.position;
  return {
    ["--zf-col-start" as string]: x + 1,
    ["--zf-col-span" as string]: w,
    ["--zf-row-start" as string]: y + 1,
    ["--zf-row-span" as string]: h,
    // Drives the entrance-cascade stagger (see .zf-frame animation-delay).
    ["--zf-enter-i" as string]: index,
  };
}

export function DashboardRenderer({
  spec,
  registry,
}: {
  spec: DashboardSpec;
  registry: FrameRegistry;
}) {
  return (
    <>
      <style>{FRAME_CSS}</style>
      <div
        className="zf-grid"
        style={{
          ["--zf-cols" as string]: spec.grid.columns,
          ["--zf-row-h" as string]: `${spec.grid.rowHeight}px`,
          ["--zf-gap" as string]: `${spec.grid.gap}px`,
          // Colour identity (spec.theme): accent hue+sat drive every accent in
          // FRAME_CSS (card rims, title dots, source links); base hue+sat tint
          // the dark card surface itself.
          ["--zf-accent-hue" as string]: spec.theme.accentHue,
          ["--zf-accent-sat" as string]: `${spec.theme.accentSat}%`,
          ["--zf-base-hue" as string]: spec.theme.baseHue,
          ["--zf-base-sat" as string]: `${spec.theme.baseSat}%`,
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
            style={positionStyle(instance, index)}
          />
        ))}
      </div>
    </>
  );
}
