"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// Real dashboard screenshot layered over the card's SVG mini-map. Optimistic:
// always requested, faded in only once it loads — a 404 (no nightly capture
// yet) or any error leaves the silhouette showing, so callers never need to
// know whether a capture exists. next/image so the optimizer downscales and
// reformats the 1440px nightly JPEG for the ~400px gallery card; `fill` keeps
// the old absolute-inset-0 layout inside the card's relative aspect-[16/9] box.
export function ThumbImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // A cache-warm image can finish (or fail) BEFORE React hydrates, so the
  // onLoad/onError props never fire — read the settled state off the element.
  useEffect(() => {
    const el = ref.current;
    if (!el?.complete) return;
    if (el.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, []);

  if (failed) return null;
  return (
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
  );
}
