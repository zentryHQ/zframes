import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { imageMeta } from "./schemas";

const schema = imageMeta.schema;

function ImageFrame({ config }: { config: z.output<typeof schema> }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md">
      <img
        src={config.url}
        alt={config.alt}
        className="h-full w-full"
        style={{ objectFit: config.fit }}
      />
    </div>
  );
}

export const imageFrame = defineFrame({
  ...imageMeta,
  component: ImageFrame,
});
