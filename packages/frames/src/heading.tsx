import { defineFrame } from "@zframes/core";
import type { CSSProperties } from "react";
import type { z } from "zod";
import { headingMeta } from "./schemas";

const schema = headingMeta.schema;

function Heading({ config }: { config: z.output<typeof schema> }) {
  const accented = config.accent !== undefined;
  const centered = config.align === "center";

  // Setting --zf-accent-hue on the root re-tints --color-highlight /
  // --color-accent-line (both hsl(var(--zf-accent-hue)…)) for this subtree, so
  // the dot picks up the hue automatically. Unset = the dashboard accent.
  const rootStyle = accented
    ? ({ "--zf-accent-hue": String(config.accent) } as CSSProperties)
    : undefined;

  const strong = accented
    ? "hsl(var(--zf-accent-hue) 80% 70% / 0.5)"
    : "rgba(255,255,255,0.16)";
  const mid = accented
    ? "hsl(var(--zf-accent-hue) 80% 70% / 0.06)"
    : "rgba(255,255,255,0.02)";
  const ruleRight = `linear-gradient(90deg, ${strong}, ${mid} 65%, transparent)`;
  const ruleLeft = `linear-gradient(90deg, transparent, ${mid} 35%, ${strong})`;

  const rule = (bg: string) => (
    <span className="mb-[5px] h-px flex-1" style={{ background: bg }} />
  );

  const label = (
    <div
      className={`flex min-w-0 flex-col gap-1 ${centered ? "items-center" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{
            background: "var(--color-highlight)",
            boxShadow: "0 0 8px var(--color-highlight)",
          }}
        />
        <h2
          className={`body-md font-extrabold uppercase leading-none tracking-[0.14em] ${
            accented ? "text-highlight" : "text-strong"
          }`}
        >
          {config.title}
        </h2>
      </div>
      {config.subtitle && (
        <p
          className={`caption text-soft leading-none ${centered ? "" : "pl-[13px]"}`}
        >
          {config.subtitle}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full items-end gap-3 pb-2" style={rootStyle}>
      {centered && rule(ruleLeft)}
      {label}
      {rule(ruleRight)}
    </div>
  );
}

export const headingFrame = defineFrame({
  ...headingMeta,
  component: Heading,
});
