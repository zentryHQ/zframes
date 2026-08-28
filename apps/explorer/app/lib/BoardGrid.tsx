import type { ComponentProps } from "react";
import { cn } from "@/app/lib/utils";

/**
 * The gallery's board grid: 1 → 2 → 3 columns. The real grid and its loading
 * skeleton both use it, so the two cannot drift a breakpoint apart and leave the
 * skeleton reflowing differently from the cards it stands in for — a thing nobody
 * notices in review. (It was four copies when the gallery had two sections.)
 *
 * Spreads the rest of the div props (the skeletons pass `aria-hidden`) and merges
 * `className` through `cn`, so a caller can still override a utility.
 */
export function BoardGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}
