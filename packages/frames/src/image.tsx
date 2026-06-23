import { defineFrame } from "@zframes/core";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { imageMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = imageMeta.schema;

function ImageFrame({ config }: { config: z.output<typeof schema> }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => setState("loading"), [config.url]);

  if (state === "error") return <FrameStatus>image unavailable</FrameStatus>;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md">
      {state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading image…</FrameStatus>
        </div>
      )}
      <img
        src={config.url}
        alt={config.alt}
        className={`h-full w-full transition-opacity duration-300 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        style={{ objectFit: config.fit }}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}

export const imageFrame = defineFrame({
  ...imageMeta,
  component: ImageFrame,
});
