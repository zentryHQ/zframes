"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Real dashboard screenshot layered over the card's SVG mini-map. Optimistic:
// always requested, faded in only once it loads — a 404 (no nightly capture
// yet) or any error leaves the silhouette showing, so callers never need to
// know whether a capture exists. next/image so the optimizer downscales and
// reformats the 1440px nightly JPEG for the ~400px gallery card; `fill` keeps
// the old absolute-inset-0 layout inside the card's relative aspect-[16/9] box.
//
// The silhouette (the SVG mini-map) is passed IN rather than rendered as a
// sibling: it's server-rendered (children of a client component), paints
// before the image arrives, stays when the image fails — and is REMOVED once
// the screenshot has fully faded in. Without that, a gallery of ~70 cards ×
// ~10-30 glyph <svg>s each keeps thousands of permanently-occluded nodes in
// layout for the rest of the visit.
export function ThumbImage({
  src,
  alt,
  className = "",
  silhouette,
}: {
  src: string;
  alt: string;
  className?: string;
  /** The SVG mini-map layered under the screenshot; dropped once covered. */
  silhouette?: ReactNode;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Flips a beat after `loaded` — past the 500ms fade — so the silhouette
  // never vanishes under a still-transparent image.
  const [covered, setCovered] = useState(false);

  // A cache-warm image can finish (or fail) BEFORE React hydrates, so the
  // onLoad/onError props never fire — read the settled state off the element.
  useEffect(() => {
    const el = ref.current;
    if (!el?.complete) return;
    if (el.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(() => setCovered(true), 700);
    return () => window.clearTimeout(t);
  }, [loaded]);

  if (failed) return <>{silhouette}</>;
  return (
    <>
      {!covered && silhouette}
      <Image
        ref={ref}
        src={src}
        alt={alt}
        fill
        // Gallery cards: full-width on phones, 2-up on tablets, ~400px in the
        // 3-up desktop grid.
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`object-cover object-top transition-opacity duration-500 ${className} ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}
