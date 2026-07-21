import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { heroNumberMeta } from "./schemas";

const schema = heroNumberMeta.schema;

function HeroNumber({ config }: { config: z.output<typeof schema> }) {
  const deltaColor =
    config.deltaDir === "up"
      ? UP_COLOR
      : config.deltaDir === "down"
        ? DOWN_COLOR
        : "var(--color-soft)";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
      {config.label && (
        <div className="caption text-soft uppercase tracking-[0.12em]">
          {config.label}
        </div>
      )}
      <div className="metric-lg text-strong break-words leading-none">
        {config.value}
      </div>
      {config.delta && (
        <div
          className="body-sm font-semibold tabular-nums"
          style={{ color: deltaColor }}
        >
          {config.delta}
        </div>
      )}
      {config.sublabel && (
        <div className="caption text-disabled">{config.sublabel}</div>
      )}
    </div>
  );
}

export const heroNumberFrame = defineFrame({
  ...heroNumberMeta,
  component: HeroNumber,
});
