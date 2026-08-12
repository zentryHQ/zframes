"use client";

import { useEffect, useRef, useState } from "react";
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
 *   • Clicks are OPTIMISTIC AND PARALLEL. Nothing serializes behind the round
 *     trip — each click fires its own request immediately, so a burst of five
 *     reads as five beats and five "+1"s, not one click and four swallowed.
 *     The server's cap-burn transaction is race-safe by design (ticket 003).
 *   • Motion is a per-click heart beat + a rising fill + the "+1" float —
 *     snappy, transform-only, still terminal-calm: no bounce, no pink confetti.
 *     PRODUCT.md's anti-references name crypto-casino neon explicitly.
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
  /** Fired on a confirmed like with the SERVER's new total, so a parent holding many
   *  counts (the catalogue's shared map) stays in step without refetching — and
   *  cannot drift from what this button shows, which a local `+1` could. */
  onLiked?: (name: string, total: number) => void;
}) {
  // THE COUNT HAS TWO SOURCES and the split matters. `initialTotal` is the parent's
  // number, which on the catalogue arrives AFTER mount (the counts fetch resolves
  // post-render) — so seeding state from it once left every card badge stuck at 0
  // while the most-liked strip showed the real figures on the same screen.
  //
  // `confirmed` is the server's answer to OUR click, which outranks the prop from
  // then on. Deriving the display instead of storing it means a late-arriving prop
  // updates the badge, and a confirmed like is never reverted by one.
  const [confirmed, setConfirmed] = useState<number | null>(null);
  // Ref twin of `confirmed`. Parallel clicks settle out of order, and a stale
  // closure reading `confirmed` from its own render would let an EARLIER response
  // (a smaller total) land after a later one and roll the count backwards. The
  // ref is always current, so every settle takes max(known, server) and the
  // count only moves forward.
  const confirmedRef = useRef<number | null>(null);
  // Counts clicks in flight, so each optimistic bump survives a prop change and is
  // removed exactly once when its own request settles either way.
  const [inFlight, setInFlight] = useState(0);
  const total = (confirmed ?? initialTotal) + inFlight;
  const [spent, setSpent] = useState(0);
  const [wall, setWall] = useState<"item-cap" | "ip-cap" | null>(null);
  // A request that failed for a NON-cap reason (offline, 5xx). Distinct from `wall`
  // because it is retryable — the button stays enabled and says so.
  const [failed, setFailed] = useState(false);
  // One key per click so each "+1" is its own element and a fast second click
  // doesn't restart the first one's animation mid-flight. Keys come from a
  // monotonic counter, NOT Date.now(): burst clicks can share a millisecond, and
  // duplicate keys would make the settle-time filter remove both "+1"s.
  const [pops, setPops] = useState<number[]>([]);
  const clickSeq = useRef(0);
  // Total clicks this mount — drives the heart's per-click beat (the a/b
  // animation-name flip that restarts it mid-flight; see globals.css).
  const [clicks, setClicks] = useState(0);

  // The mirror is read AFTER mount, never during render: localStorage doesn't
  // exist on the server, and seeding state from it would make the first paint
  // differ from the server's HTML (hydration mismatch).
  useEffect(() => {
    setSpent(spentToday(kind, id));
  }, [kind, id]);

  const exhausted = spent >= CLIENT_ITEM_CAP || wall !== null;

  async function like() {
    if (exhausted) return;
    setFailed(false);
    // Optimistic: the count moves now. The charter chose optimism over accuracy
    // here because a like that takes a round trip to appear feels broken — and
    // for the same reason nothing awaits a previous click. Bursts are the point
    // of an additive control, so each click ships its own request in parallel.
    const click = ++clickSeq.current;
    setClicks(click);
    setInFlight((n) => n + 1);
    setSpent((s) => s + 1);
    setPops((p) => [...p, click]);
    const outcome: LikeOutcome = await sendLike(kind, id);
    // Always clear this click's optimistic unit — `confirmed` carries it on success,
    // and on failure nothing was recorded, so leaving the number up would be a lie
    // that survives until reload.
    setInFlight((n) => Math.max(0, n - 1));
    if (outcome.ok) {
      // The server's total, not our guess — it may have moved further if someone
      // else liked between our render and our click. Clamped monotonic through
      // the ref so an out-of-order sibling response can't drag it back down.
      const best = Math.max(confirmedRef.current ?? 0, outcome.total);
      confirmedRef.current = best;
      setConfirmed(best);
      onLiked?.(id, best);
      return;
    }
    setSpent((s) => Math.max(0, s - 1));
    // Pull this click's "+1" back, and SAY something. Left alone, a 5xx played the
    // +1, ticked the count up, dropped it back, and left the button enabled — a
    // failure that looks exactly like a success, and the motion that was supposed
    // to prove the click landed proving the opposite.
    setPops((p) => p.filter((k) => k !== click));
    if (outcome.reason === "item-cap" || outcome.reason === "ip-cap") {
      setWall(outcome.reason);
      return;
    }
    setFailed(true);
  }

  const label = exhausted
    ? wall === "ip-cap"
      ? `${total} likes — your network's daily likes are used up`
      : `${total} likes — you've used today's likes, back tomorrow`
    : failed
      ? `${total} likes — that like didn't save, try again`
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
            : failed
              ? "That like didn't save — click to try again"
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
          : failed
            ? // Still enabled — the failure is retryable, so the colour says
              // "something went wrong" without taking the action away.
              cn(
                "text-down hover:text-down",
                !compact && "border-down/40 bg-down/10",
              )
            : cn(
                "text-white/75 hover:text-indigo-100",
                !compact &&
                  "border-white/15 hover:border-indigo-300/45 hover:bg-indigo-500/10",
              ),
        className,
      )}
    >
      <HeartMeter
        filled={spent}
        of={CLIENT_ITEM_CAP}
        compact={compact}
        beat={clicks}
      />
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
          total, and announcing both would say the number twice. Burst clicks all
          spawn from the same point, so each pop gets a small alternating
          x-offset via the `translate` property (which composes with the
          keyframes' `transform`) — simultaneous "+1"s read as separate pops
          instead of one smear. */}
      <span
        className="pointer-events-none absolute inset-x-0 -top-1 flex justify-center"
        aria-hidden
      >
        {pops.map((k) => (
          <span
            key={k}
            className="zf-plusone absolute font-mono text-[11px] font-semibold text-indigo-200"
            style={{ translate: `${((k % 3) - 1) * 9}px` }}
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
  beat = 0,
}: {
  filled: number;
  of: number;
  compact?: boolean;
  /** Click count. Flipping between two identical animations restarts the beat
   *  without a remount — a remount would also reset the fill's clip-path and
   *  kill its transition, so the rise would stop reading during a burst. */
  beat?: number;
}) {
  const pct = Math.min(100, Math.round((filled / of) * 100));
  const size = compact ? "size-3" : "size-4";
  return (
    <span
      className={cn(
        "relative inline-block shrink-0",
        size,
        beat > 0 && (beat % 2 ? "zf-heartbeat-a" : "zf-heartbeat-b"),
      )}
      aria-hidden
    >
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
          className="zf-heart-fill absolute inset-0 overflow-hidden"
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
