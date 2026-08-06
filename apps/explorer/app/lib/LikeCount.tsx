import { cn } from "@/app/lib/utils";

/**
 * The read-only twin, for gallery cards. Same object, no interaction — the charter
 * puts the button one click deeper (on the board's own page) but keeps the number
 * visible in the grid, because a "most liked" sort whose key you can't see is a UI
 * asking to be trusted.
 *
 * Server-safe, and in its OWN module to actually be so: this file carries no
 * "use client" directive. It used to live beside LikeButton, which does — so a
 * server component importing the count dragged the button, the meter and the
 * localStorage client into bundles for pages that have no like button at all.
 */
export function LikeCount({
  total,
  className,
}: {
  total: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] text-white/60",
        className,
      )}
      title={`${total} ${total === 1 ? "like" : "likes"}`}
    >
      <svg viewBox="0 0 24 24" className="size-3" fill="none" aria-hidden>
        <path
          d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5c0 5.15-7 9.5-7 9.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="tabular-nums">{total}</span>
      <span className="sr-only">{total === 1 ? "like" : "likes"}</span>
    </span>
  );
}
