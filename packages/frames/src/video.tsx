import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { videoMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = videoMeta.schema;

/** Resolve a user-pasted URL to an embeddable iframe src, or null if unusable. */
function parseEmbedUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  // YouTube: youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }
  // Vimeo: vimeo.com/ID, player.vimeo.com/video/ID
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id)
      ? `https://player.vimeo.com/video/${id}`
      : null;
  }
  if (host === "player.vimeo.com") return url.toString();
  // Anything else: only trust an https URL as a direct embeddable src.
  return url.protocol === "https:" ? url.toString() : null;
}

function VideoFrame({ config }: { config: z.output<typeof schema> }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const src = useMemo(() => parseEmbedUrl(config.url), [config.url]);

  useEffect(() => setState("loading"), [src]);

  if (!src) return <FrameStatus>invalid video URL</FrameStatus>;
  if (state === "error") return <FrameStatus>video unavailable</FrameStatus>;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading video…</FrameStatus>
        </div>
      )}
      <iframe
        key={src}
        src={src}
        title={config.title}
        className={`h-full w-full border-0 transition-opacity duration-300 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}

export const videoFrame = defineFrame({
  ...videoMeta,
  component: VideoFrame,
});
