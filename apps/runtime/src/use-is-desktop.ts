import { useEffect, useState } from "react";

// Editing (GridStack drag/resize) is a desktop activity — the editor is heavy
// and awkward on touch — so it's gated to desktop widths AND a hover-capable
// fine pointer: the per-card delete/config affordances are hover-revealed, so
// a 1024px iPad in landscape would mount an editor it can't actually drive.
// Touch tablets get the read-only DashboardRenderer, which reflows on its own
// through CSS (single column <=640px, two columns 641-1023px; see FRAME_CSS in
// @zframes/core). This query ONLY decides renderer-vs-editor; it's deliberately
// distinct from those CSS reflow breakpoints, which need no JS.
const DESKTOP_QUERY =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine)";

export function useMediaQuery(query: string) {
  // SPA (no SSR) — window is available, so seed synchronously to avoid a flash.
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Seed again in case the query prop changed between render and effect.
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY);
}
