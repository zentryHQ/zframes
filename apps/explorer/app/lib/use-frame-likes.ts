"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  /** Record a CONFIRMED like — the server's own total, not a local increment, so
   *  the strip and the card badge cannot disagree about the same frame. */
  bump: (name: string, total: number) => void;
  /** False until the first response — the most-liked strip waits on it, so it
   *  can't flash in showing nothing and then reorder. */
  loaded: boolean;
} {
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  // Frames the user has confirmed a like on. Their local value outranks the fetch,
  // which is what stops a slow GET from erasing a like that already landed.
  const owned = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/likes")
      .then((r) => (r.ok ? r.json() : { frames: {} }))
      .then((d: { frames?: Record<string, number> }) => {
        if (!alive) return;
        // MERGE, don't replace. A wholesale replace discarded any like confirmed
        // while the request was in flight: like at t=400ms, response lands at
        // t=600ms carrying the pre-click snapshot, and the strip drops back below
        // the card badge showing the same frame.
        setLikes({ ...(d.frames ?? {}), ...owned.current });
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const bump = useCallback((name: string, total: number) => {
    // The server's total, so this cannot drift from what the button shows — a local
    // `+1` on a possibly-stale base could.
    owned.current = { ...owned.current, [name]: total };
    setLikes((prev) => ({ ...prev, [name]: total }));
  }, []);

  return { likes, bump, loaded };
}
