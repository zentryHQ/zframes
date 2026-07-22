import { defineFrame } from "@zframes/core";
import type { CSSProperties } from "react";
import type { z } from "zod";
import { dividerMeta } from "./schemas";

const schema = dividerMeta.schema;
type Config = z.output<typeof schema>;

const LINE = "hsl(0 0% var(--zf-ink-l, 100%) / 0.16)";

function Divider({ config }: { config: Config }) {
  const vertical = config.orientation === "vertical";
  const label = config.label.trim();
  const accented = config.accent !== undefined;

  // --zf-accent-hue on the root lets var(--color-accent-line) resolve to the
  // chosen hue for this subtree; unset keeps the subtle white hairline.
  const rootStyle = accented
    ? ({ "--zf-accent-hue": String(config.accent) } as CSSProperties)
    : undefined;
  const color = accented ? "var(--color-accent-line)" : LINE;

  const rule = () => (
    <span
      className={`shrink ${vertical ? "w-0 flex-1" : "h-0 flex-1"}`}
      style={
        vertical
          ? {
              borderLeftWidth: config.thickness,
              borderLeftStyle: config.style,
              borderColor: color,
            }
          : {
              borderTopWidth: config.thickness,
              borderTopStyle: config.style,
              borderColor: color,
            }
      }
    />
  );

  if (!label) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center ${vertical ? "flex-col" : ""}`}
        style={rootStyle}
      >
        {rule()}
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center gap-3 ${vertical ? "flex-col py-1" : "px-1"}`}
      style={rootStyle}
    >
      {rule()}
      <span
        className={`caption shrink-0 whitespace-nowrap uppercase tracking-[0.14em] ${
          accented ? "text-highlight" : "text-soft"
        }`}
        style={vertical ? { writingMode: "vertical-rl" } : undefined}
      >
        {label}
      </span>
      {rule()}
    </div>
  );
}

export const dividerFrame = defineFrame({
  ...dividerMeta,
  component: Divider,
});
