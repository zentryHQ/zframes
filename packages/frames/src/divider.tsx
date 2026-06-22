import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { dividerMeta } from "./schemas";

const schema = dividerMeta.schema;
type Config = z.output<typeof schema>;

const LINE = "rgba(255,255,255,0.16)";

function Divider({ config }: { config: Config }) {
  const vertical = config.orientation === "vertical";
  const label = config.label.trim();

  const rule = (extra?: string) => (
    <span
      className={`shrink ${vertical ? "w-0 flex-1" : "h-0 flex-1"} ${extra ?? ""}`}
      style={
        vertical
          ? { borderLeftWidth: 1, borderLeftStyle: config.style, borderColor: LINE }
          : { borderTopWidth: 1, borderTopStyle: config.style, borderColor: LINE }
      }
    />
  );

  if (!label) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center ${vertical ? "flex-col" : ""}`}
      >
        {rule()}
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center gap-3 ${vertical ? "flex-col py-1" : "px-1"}`}
    >
      {rule()}
      <span
        className="caption text-soft shrink-0 whitespace-nowrap uppercase tracking-[0.18em]"
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
