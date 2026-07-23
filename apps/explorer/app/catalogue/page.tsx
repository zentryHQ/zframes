"use client";

import dynamic from "next/dynamic";

// The catalogue renders live frames (shared WS + browser APIs) → client-only.
const CatalogueView = dynamic(() => import("./CatalogueView"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-7xl px-6 py-16 text-white/55">
      Loading catalogue…
    </div>
  ),
});

export default function CataloguePage() {
  return <CatalogueView />;
}
