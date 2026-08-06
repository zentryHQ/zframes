"use client";

import { useEffect, useState } from "react";
import {
  CLIENT_ITEM_CAP,
  sendLike,
  spentToday,
  type LikeOutcome,
} from "@/app/lib/like-client";
import { cn } from "@/app/lib/utils";

/**
 * THE LIKE CONTROL — additive, repeatable, no undo.
 *
 * Deliberately NOT a heart toggle. A toggle promises a binary state you can
 * un-set, and this button cannot: with no account behind a click the server can't
 * tell your retraction from someone else's, so there is no undo (see the map's
 * charter). The control therefore has to read as "add enthusiasm", not "join a set":
 *
 *   • The glyph fills in CLIENT_ITEM_CAP steps as you spend your daily allowance,
 *     so remaining is legible without printing "3 of 5 left" — a number invites
 *     gaming it, an empty-to-full glyph just feels like a meter.
 *   • `aria-pressed` is deliberately absent: it would announce a toggle. The
 *     accessible name carries the count and the spent state instead.
 *   • No bounce, no pink, no burst. PRODUCT.md's anti-references name
 *     crypto-casino neon explicitly, and this sits on a market-terminal surface.
 *
 * TWO WAYS TO HIT THE WALL, and they need different words. Your own allowance is
 * spent → "back tomorrow". Or the *network's* is (`ip-cap`) → someone else behind
 * your address spent it, which is a real case on office and mobile-carrier NAT,
 * where this can happen to a first-time visitor. Saying "you already liked this"
 * there would be a lie.
 */
export function LikeButton({
  kind,
  id,
  initialTotal,
  className,
  compact = false,
  onLiked,
}: {
  kind: "dashboard" | "frame";
  id: string;
  initialTotal: number;
  className?: string;
  /** Borderless and tighter — for the catalogue's 255 card footers, where a
   *  bordered control per card turns the grid into a wall of buttons. */
  compact?: boolean;
  /** Fired on a confirmed like, so a parent holding many counts (the catalogue's
   *  shared map) can stay in step without refetching. */
  onLiked?: (name: string) => void;
}) {
  const [total, setTotal] = useState(initialTotal);
  const [spent, setSpent] = useState(0);
  const [pending, setPending] = useState(false);
  const [wall, setWall] = useState<"item-cap" | "ip-cap" | null>(null);
  // One key per click so each "+1" is its own element and a fast second click
  // doesn't restart the first one's animation mid-flight.
  const [pops, setPops] = useState<number[]>([]);

  // The mirror is read AFTER mount, never during render: localStorage doesn't
  // exist on the server, and seeding state from it would make the first paint
  // differ from the server's HTML (hydration mismatch).
  useEffect(() => {
    setSpent(spentToday(kind, id));
  }, [kind, id]);

  const exhausted = spent >= CLIENT_ITEM_CAP || wall !== null;

  async function like() {
    if (exhausted || pending) return;
    setPending(true);
    // Optimistic: the count moves now. The charter chose optimism over accuracy
    // here because a like that takes a round trip to appear feels broken.
    setTotal((t) => t + 1);
    setSpent((s) => s + 1);
    setPops((p) => [...p, Date.now()]);
    const outcome: LikeOutcome = await sendLike(kind, id);
    setPending(false);
    if (outcome.ok) {
      // Reconcile with the server's real total — it may have moved past our
      // guess if someone else liked it between our render and our click.
      setTotal(outcome.total);
      onLiked?.(id);
      return;
    }
    // Roll the optimistic bump back. `error` is included: a failed request means
    // no like was recorded, so leaving the number up would be a lie that
    // survives until reload.
    setTotal((t) => Math.max(0, t - 1));
    setSpent((s) => Math.max(0, s - 1));
    if (outcome.reason === "item-cap" || outcome.reason === "ip-cap") {
      setWall(outcome.reason);
    }
  }

  const label = exhausted
    ? wall === "ip-cap"
      ? `${total} likes — your network's daily likes are used up`
      : `${total} likes — you've used today's likes, back tomorrow`
    : `Like this ${kind} — ${total} likes so far`;

  return (
    <button
      type="button"
      onClick={like}
      disabled={exhausted}
      aria-label={label}
      title={
        wall === "ip-cap"
          ? "Your network has used today's likes — back tomorrow"
          : exhausted
            ? "Back tomorrow for more"
            : "Like this — up to 5 a day"
      }
      className={cn(
        "zf-press group/like relative inline-flex cursor-pointer items-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
        compact
          ? "gap-1 rounded-md px-1 py-0.5"
          : "gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm",
        exhausted
          ? cn(
              "cursor-default text-white/45",
              !compact && "border-white/10 bg-white/[0.03]",
            )
          : cn(
              "text-white/75 hover:text-indigo-100",
              !compact &&
                "border-white/15 hover:border-indigo-300/45 hover:bg-indigo-500/10",
            ),
        className,
      )}
    >
      <HeartMeter filled={spent} of={CLIENT_ITEM_CAP} compact={compact} />
      <span
        className={cn(
          "font-mono tabular-nums",
          compact ? "text-[10px]" : "text-xs",
        )}
        aria-hidden
      >
        {total}
      </span>
      {/* The +1 float. aria-hidden — the accessible name already carries the new
          total, and announcing both would say the number twice. */}
      <span
        className="pointer-events-none absolute inset-x-0 -top-1 flex justify-center"
        aria-hidden
      >
        {pops.map((k) => (
          <span
            key={k}
            className="zf-plusone absolute font-mono text-[11px] font-semibold text-indigo-200"
            onAnimationEnd={() => setPops((p) => p.filter((x) => x !== k))}
          >
            +1
          </span>
        ))}
      </span>
    </button>
  );
}

/**
 * A heart whose fill tracks how much of the daily allowance is spent. The fill is
 * a clipped overlay rather than N discrete pips, so five steps read as one object
 * getting fuller instead of a progress bar pretending to be an icon.
 */
function HeartMeter({
  filled,
  of,
  compact = false,
}: {
  filled: number;
  of: number;
  compact?: boolean;
}) {
  const pct = Math.min(100, Math.round((filled / of) * 100));
  const size = compact ? "size-3" : "size-4";
  return (
    <span className={cn("relative inline-block shrink-0", size)} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        className={cn("absolute inset-0", size)}
        fill="none"
      >
        <path
          d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5c0 5.15-7 9.5-7 9.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {pct > 0 && (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn("absolute inset-0 text-indigo-300", size)}
          >
            <path
              d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5c0 5.15-7 9.5-7 9.5Z"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
    </span>
  );
}

/**
 * The read-only twin, for gallery cards. Same object, no interaction — the charter
 * puts the button one click deeper (on the board's own page) but keeps the number
 * visible in the grid, because a "most liked" sort whose key you can't see is a UI
 * asking to be trusted.
 *
 * Server-safe on purpose: a card in a 18-board grid should not ship a client
 * component just to render an integer.
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
