import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { headingMeta } from "./schemas";

const schema = headingMeta.schema;

function Heading({ config }: { config: z.output<typeof schema> }) {
  return (
    <div className="flex h-full w-full items-end gap-3 pb-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className="h-[5px] w-[5px] shrink-0 rounded-full"
            style={{
              background: "var(--color-highlight)",
              boxShadow: "0 0 8px var(--color-highlight)",
            }}
          />
          <h2 className="body-md text-strong font-extrabold uppercase leading-none tracking-[0.14em]">
            {config.title}
          </h2>
        </div>
        {config.subtitle && (
          <p className="caption text-soft pl-[13px] leading-none">
            {config.subtitle}
          </p>
        )}
      </div>
      <span
        className="mb-[5px] h-px flex-1"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02) 65%, transparent)",
        }}
      />
    </div>
  );
}

export const headingFrame = defineFrame({
  ...headingMeta,
  component: Heading,
});
