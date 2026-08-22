import type { ComponentProps } from "react";
import { cn } from "@/app/lib/utils";

/**
 * The gallery's board grid: 1 → 2 → 3 columns. Both real sections and both
 * loading skeletons used it, so the four copies could drift a breakpoint apart
 * and the skeletons would simply reflow differently from the cards they stand in
 * for — a thing nobody notices in review.
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
