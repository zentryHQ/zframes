import { defineFrame } from "@zframes/core";
import { useState } from "react";
import { drawdyMeta } from "./schemas";
import { FrameStatus } from "./ui";

function DrawdyFrame() {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  if (state === "error") return <FrameStatus>canvas unavailable</FrameStatus>;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading canvas…</FrameStatus>
        </div>
      )}
      <iframe
        src="https://drawdy.io"
        title="Drawdy Canvas"
        className={`h-full w-full border-0 transition-opacity duration-300 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        allow="clipboard-read; clipboard-write"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}

export const drawdyFrame = defineFrame({
  ...drawdyMeta,
  component: DrawdyFrame,
});
