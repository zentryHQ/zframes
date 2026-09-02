import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { videoMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { useFrameActivity } from "./use-frame-active";

const schema = videoMeta.schema;

/**
 * YouTube only listens for player commands when the embed opts into its
 * postMessage API, so every YouTube src this frame builds carries the flag —
 * that is what lets the card pause a player it can no longer show.
 */
function youtubeEmbed(id: string): string {
  return `https://www.youtube.com/embed/${id}?enablejsapi=1`;
}

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
    return id ? youtubeEmbed(id) : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id ? youtubeEmbed(id) : null;
    }
    const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
    return match ? youtubeEmbed(match[1]!) : null;
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

/**
 * The "stop playing" message for a player we know how to talk to, addressed to
 * that player's own origin rather than `*`.
 *
 * Only YouTube and Vimeo publish a control channel; a bare https src pasted
 * into the card is some other site's page, so there is nothing to send it and
 * it keeps playing. Unmounting instead would stand ANY embed down, but it also
 * throws away the playback position of the one the reader is listening to, so
 * pausing is what this does and the unknown case is left alone.
 */
function pauseMessage(src: string): { message: string; origin: string } | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (
    url.hostname.endsWith("youtube.com") ||
    url.hostname.endsWith("youtube-nocookie.com")
  )
    return {
      message: JSON.stringify({
        event: "command",
        func: "pauseVideo",
        args: [],
      }),
      origin: url.origin,
    };
  if (url.hostname === "player.vimeo.com")
    return { message: JSON.stringify({ method: "pause" }), origin: url.origin };
  return null;
}

function VideoFrame({ config }: { config: z.output<typeof schema> }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const src = useMemo(() => parseEmbedUrl(config.url), [config.url]);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  /**
   * A player is the most expensive thing a card can hold, and it was the only
   * one with no idea whether anyone was there: it decoded video and played
   * audio off-screen and in a hidden tab, on a product that otherwise stands
   * down completely. `everActive` defers the whole embed until the card is
   * first seen, so a board with a video below the fold loads nothing.
   */
  const { active, everActive } = useFrameActivity(rootRef);
  const pause = useMemo(() => (src ? pauseMessage(src) : null), [src]);

  useEffect(() => setState("loading"), [src]);

  useEffect(() => {
    // Pause on the way out only — never resume on the way back. Audio starting
    // itself because a card scrolled into view is the worse surprise, and the
    // reader's own play button is right there.
    if (active || !pause) return;
    frameRef.current?.contentWindow?.postMessage(pause.message, pause.origin);
  }, [active, pause]);

  if (!src) return <FrameStatus>invalid video URL</FrameStatus>;
  if (state === "error") return <FrameStatus>video unavailable</FrameStatus>;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden rounded-md"
    >
      {/* Not `FrameStatus loading` before the first view: a card that has not
          started is neither loading nor resolved-with-no-data, and claiming
          either would have the nightly thumbnail capture wait on it. */}
      {everActive && state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading video…</FrameStatus>
        </div>
      )}
      {everActive && (
        <iframe
          key={src}
          ref={frameRef}
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
      )}
    </div>
  );
}

export const videoFrame = defineFrame({
  ...videoMeta,
  component: VideoFrame,
});
