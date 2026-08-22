import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils";

/**
 * A `zf-surface` panel holding a line of copy and (usually) one CTA — the shape
 * every "nothing here yet" state and the landing page's closing call to action
 * already had, four hand-written copies deep.
 *
 * Children-taking rather than prop-driven because the CTA genuinely varies: a
 * `<Button asChild>`, an inline `<Link>` inside a sentence, a heading plus a
 * gradient CTA. Only the panel is shared.
 *
 * NO `"use client"` and no hooks, on purpose: `mine/page.tsx` and `GalleryView`
 * are client components while `LandingView` is a server component, and a
 * prop-only module is the one shape both trees can render. Keep it that way — a
 * hook or a context here would build the landing page into a runtime error.
 *
 * `align` picks the two shapes in use: `start` for the compact in-page notices,
 * `center` for the full-width centred panels. `className` merges last (via `cn`,
 * which is tailwind-merge), so a caller can still tune one utility — the gallery
 * tightens the gap to match its two stacked lines.
 */
export function EmptyState({
  align = "start",
  className,
  children,
}: {
  align?: "start" | "center";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "zf-surface flex flex-col",
        align === "center"
          ? "items-center gap-4 px-6 py-14 text-center"
          : "items-start gap-3 p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
