import { defineFrame } from "@zframes/core";
import { useMemo, useState } from "react";
import type { z } from "zod";
import { spotifyEmbedMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = spotifyEmbedMeta.schema;
type Config = z.output<typeof schema>;

const TYPES = ["track", "album", "playlist", "artist", "episode", "show"];

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

  if (!src)
    return <FrameStatus>paste a Spotify track / album / playlist URL</FrameStatus>;
  if (state === "error") return <FrameStatus>player unavailable</FrameStatus>;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {state === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading player…</FrameStatus>
        </div>
      )}
      <iframe
        key={src + String(config.compact)}
        src={src}
        title="Spotify player"
        className="w-full"
        height={config.compact ? 152 : "100%"}
        style={{ border: 0, height: config.compact ? 152 : "100%" }}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}

export const spotifyEmbedFrame = defineFrame({
  ...spotifyEmbedMeta,
  component: SpotifyEmbed,
});
