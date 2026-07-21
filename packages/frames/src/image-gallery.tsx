import { defineFrame } from "@zframes/core";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { imageGalleryMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = imageGalleryMeta.schema;

type LoadState = "loading" | "loaded" | "error";

function ImageGallery({ config }: { config: z.output<typeof schema> }) {
  const { images, intervalSec, fit } = config;
  const [idx, setIdx] = useState(0);
  const [states, setStates] = useState<LoadState[]>(() =>
    images.map(() => "loading"),
  );
  const refs = useRef<(HTMLImageElement | null)[]>([]);

  // Re-seed and reconcile whenever the image list changes. Like the single
  // image frame: a cached / localhost <img> can be `.complete` before React
  // attaches onLoad, so the event never fires — read straight off the element.
  useEffect(() => {
    setIdx(0);
    setStates(
      images.map((_, i) => {
        const img = refs.current[i];
        if (img?.complete) return img.naturalWidth > 0 ? "loaded" : "error";
        return "loading";
      }),
    );
  }, [images]);

  useEffect(() => {
    if (intervalSec <= 0 || images.length <= 1) return;
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % images.length),
      intervalSec * 1000,
    );
    return () => window.clearInterval(id);
  }, [intervalSec, images.length]);

  const cur = Math.min(idx, images.length - 1);
  const setState = (i: number, s: LoadState) =>
    setStates((prev) => prev.map((p, j) => (j === i ? s : p)));

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {states[cur] === "loading" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus loading>loading image…</FrameStatus>
        </div>
      )}
      {states[cur] === "error" && (
        <div className="absolute inset-0 z-10">
          <FrameStatus>image unavailable</FrameStatus>
        </div>
      )}
      {images.map((img, i) => (
        <img
          key={`${i}:${img.url}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          src={img.url}
          alt={img.alt}
          className="absolute inset-0 h-full w-full transition-opacity duration-700"
          style={{
            objectFit: fit,
            opacity: i === cur && states[i] === "loaded" ? 1 : 0,
          }}
          onLoad={() => setState(i, "loaded")}
          onError={() => setState(i, "error")}
        />
      ))}
    </div>
  );
}

export const imageGalleryFrame = defineFrame({
  ...imageGalleryMeta,
  component: ImageGallery,
});
