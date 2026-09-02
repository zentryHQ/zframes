import { defineFrame } from "@zframes/core";
import { useRef, useState } from "react";
import { drawdyMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { useFrameActivity } from "./use-frame-active";

function DrawdyFrame() {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * Deferred to the first view, and then MOUNTED FOR GOOD — deliberately
   * unlike the video and Spotify cards, which stand down every time they leave
   * the screen.
   *
   * This iframe holds the reader's drawing, and drawdy.io exposes no pause and
   * no save this frame can call. So the two ways to stand it down off-screen
   * both cost the whiteboard: unmounting discards it, and there is nothing to
   * pause. Deferring the first mount is the whole saving available without
   * throwing away work — a board with this card below the fold now loads it
   * only if the reader scrolls to it. The residual cost of a canvas that HAS
   * been opened is upstream of us.
   */
  const { everActive } = useFrameActivity(rootRef);

  if (state === "error") return <FrameStatus>canvas unavailable</FrameStatus>;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden rounded-md"
    >
      {everActive && state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading canvas…</FrameStatus>
        </div>
      )}
      {everActive && (
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
      )}
    </div>
  );
}

export const drawdyFrame = defineFrame({
  ...drawdyMeta,
  component: DrawdyFrame,
});
