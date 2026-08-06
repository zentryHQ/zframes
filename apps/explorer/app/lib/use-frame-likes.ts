"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Every frame's like count, fetched ONCE for the whole catalogue.
 *
 * `/catalogue` fetches nothing today and mounts 255 live frames, so the counts must
 * not become a per-card request — that is why `/api/likes` returns one
 * `{name: likes}` map rather than a per-frame endpoint.
 *
 * Failure is silent and total: `{}` reads as "everything at 0", which is exactly
 * what the page showed before likes existed. A counts request that 500s must not
 * take the catalogue down with it.
 */
export function useFrameLikes(): {
  likes: Record<string, number>;
  /** Optimistic local bump, so a click moves the badge without a refetch. */
  bump: (name: string) => void;
  /** False until the first response — the most-liked strip waits on it, so it
   *  can't flash in showing nothing and then reorder. */
  loaded: boolean;
} {
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/likes")
      .then((r) => (r.ok ? r.json() : { frames: {} }))
      .then((d: { frames?: Record<string, number> }) => {
        if (!alive) return;
        setLikes(d.frames ?? {});
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const bump = useCallback((name: string) => {
    setLikes((prev) => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }));
  }, []);

  return { likes, bump, loaded };
}
