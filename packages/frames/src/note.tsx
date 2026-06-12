import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { noteMeta } from "./schemas";

const schema = noteMeta.schema;

function Note({ config }: { config: z.output<typeof schema> }) {
  return (
    <div
      className={`body-md text-normal h-full overflow-auto whitespace-pre-wrap ${
        config.align === "center"
          ? "flex items-center justify-center text-center"
          : ""
      }`}
    >
      {config.text}
    </div>
  );
}

export const noteFrame = defineFrame({
  ...noteMeta,
  component: Note,
});
