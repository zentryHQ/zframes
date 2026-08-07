"use client";

import dynamic from "next/dynamic";

/**
 * The client-only half of `/catalogue`.
 *
 * Exists as its own file for one mechanical reason: `next/dynamic` with
 * `ssr: false` is not allowed in a Server Component, and `page.tsx` had to become
 * one so the catalogue's heading and its full-text frame index could be rendered
 * on the server. This is the smallest possible `"use client"` boundary around
 * that restriction — a dynamic import and nothing else.
 */
const CatalogueView = dynamic(() => import("./CatalogueView"), {
  ssr: false,
  loading: () => <div className="py-16 text-white/55">Loading catalogue…</div>,
});

export default function CatalogueClient() {
  return <CatalogueView />;
}
