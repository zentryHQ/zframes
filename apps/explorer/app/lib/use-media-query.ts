"use client";

import { useEffect, useState } from "react";

/** True while `query` matches. SSR-safe: renders `false` on the server and on
 *  the hydration pass, then corrects in an effect — callers must treat the
 *  `false` branch as the safe default (read-only / static markup). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The explorer's editing gate, matching the runtime's: GridStack drag/resize
 *  needs desktop width AND a hover-capable fine pointer — the editor's per-card
 *  affordances are hover-revealed, so a 1024px touch tablet can't drive them. */
export const DESKTOP_EDIT_QUERY =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
