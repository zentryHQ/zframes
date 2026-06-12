import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { headingMeta } from "./schemas";

const schema = headingMeta.schema;

function Heading({ config }: { config: z.output<typeof schema> }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <h2 className="heading-title-md text-strong">{config.title}</h2>
      {config.subtitle && (
        <p className="body-sm text-soft">{config.subtitle}</p>
      )}
    </div>
  );
}

export const headingFrame = defineFrame({
  ...headingMeta,
  component: Heading,
});
