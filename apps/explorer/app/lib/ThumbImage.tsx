"use client";

import { useEffect, useRef, useState } from "react";

// Real dashboard screenshot layered over the card's SVG mini-map. Optimistic:
// always requested, faded in only once it loads — a 404 (no nightly capture
// yet) or any error leaves the silhouette showing, so callers never need to
// know whether a capture exists. Plain <img>: the source is our own tiny API
// route, next/image optimization would just proxy it.
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
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${className} ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
