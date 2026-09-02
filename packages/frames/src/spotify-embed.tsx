import { defineFrame } from "@zframes/core";
import { useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { spotifyEmbedMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { useFrameActivity } from "./use-frame-active";

const schema = spotifyEmbedMeta.schema;
type Config = z.output<typeof schema>;

const TYPES = ["track", "album", "playlist", "artist", "episode", "show"];

/**
 * Spotify's compact player is a single 152px row. Taller than that and the
 * embed draws the full player (artwork, big controls) by itself, which is why
 * sizing the iframe to the card is all this needs: `min()` lets a compact card
 * fill whatever it was given up to the row height, instead of pinning 152px
 * into a one-row card and clipping, or into a four-row card and leaving the
 * rest blank.
 */
const COMPACT_HEIGHT = "min(100%, 152px)";

/** Resolve a public open.spotify.com share URL to its iframe embed src. */
function parseSpotifyEmbed(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.hostname.replace(/^www\./, "") !== "open.spotify.com") return null;
  // Handles locale-prefixed paths too, e.g. /intl-en/track/<id>.
  const parts = url.pathname.split("/").filter(Boolean);
  const ti = parts.findIndex((p) => TYPES.includes(p));
  if (ti === -1 || !parts[ti + 1]) return null;
  return `https://open.spotify.com/embed/${parts[ti]}/${parts[ti + 1]}`;
}

function SpotifyEmbed({ config }: { config: Config }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const src = useMemo(() => parseSpotifyEmbed(config.url), [config.url]);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * Deferred to the first view, and then left alone — deliberately unlike the
   * video card beside it, which pauses every time it leaves the screen.
   *
   * BACKGROUND LISTENING IS THIS FRAME'S USE CASE. Someone starts a playlist
   * and then scrolls the board or switches tabs to do something else; stopping
   * the music at that moment would break the one thing the card is for. A video
   * is watched, so pausing it when it cannot be seen costs the reader nothing —
   * audio is the opposite. So the only saving taken here is the one that costs
   * nothing: a player nobody has scrolled to yet is never loaded at all.
   */
  const { everActive } = useFrameActivity(rootRef);

  if (!src)
    return (
      <FrameStatus>paste a Spotify track / album / playlist URL</FrameStatus>
    );
  if (state === "error") return <FrameStatus>player unavailable</FrameStatus>;

  const height = config.compact ? COMPACT_HEIGHT : "100%";

  return (
    <div
      ref={rootRef}
      // `items-center` so a compact row on a tall card sits in the middle of
      // the body and the leftover space reads as padding, not as a gap.
      className="relative flex h-full w-full items-center overflow-hidden rounded-md"
    >
      {/* Nothing before the first view — see the video frame's note on why this
          is not the loading branch. */}
      {everActive && state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading player…</FrameStatus>
        </div>
      )}
      {everActive && (
        <iframe
          key={src + String(config.compact)}
          src={src}
          title="Spotify player"
          className="w-full"
          style={{ border: 0, height }}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      )}
    </div>
  );
}

export const spotifyEmbedFrame = defineFrame({
  ...spotifyEmbedMeta,
  component: SpotifyEmbed,
});
