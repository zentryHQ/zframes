import { type CSSProperties } from "react";
import type { FrameRegistry } from "./frame";
import { FRAME_CSS, FrameContent } from "./frame-content";
import type { DashboardSpec, FrameInstance } from "./spec";

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
