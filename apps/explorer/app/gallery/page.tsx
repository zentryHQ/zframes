import type { Metadata } from "next";
import { GalleryView } from "./GalleryView";

export const metadata: Metadata = {
  title: "Gallery · zframes",
  description:
    "Browse curated and community zframes dashboards. Preview any one live with real data, then fork it onto your machine.",
};

export default function GalleryPage() {
  return <GalleryView />;
}
