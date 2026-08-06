import { allFrameMetas } from "@zframes/frames/schemas";
import { and, eq, lte, ne, sql } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { dashboards, frameLikes, likeGrants } from "@/app/lib/db/schema";
import {
  PER_IP_DAILY_CAP,
  PER_ITEM_DAILY_CAP,
  GRANT_RETENTION_DAYS,
  type LikeKind,
  utcDay,
} from "./likes-cap";

/**
 * The DATABASE half of the like cap. The value decisions and the visitor keying
 * live in `./likes-cap` — kept separate because this file imports `@/app/lib/db`,
 * which throws at import time without DATABASE_URL, and `pnpm test` is hermetic.
 * Splitting them is what makes the keying testable at all; see likes-cap.test.ts.
 */

/** The valid frame-like targets. Built once — 255 entries, and the route would
 *  otherwise rebuild the set per request. */
const FRAME_NAMES = new Set(allFrameMetas.map((m) => m.name));

/** The transaction handle Drizzle hands the callback. Named because three helpers
 *  take it and the inferred type is unreadable inline. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LikeResult =
  | { ok: true; total: number; remaining: number }
  | { ok: false; reason: "item-cap" | "ip-cap" | "missing" };

/**
 * Claim one like: burn both allowances and increment the counter, **atomically**.
 *
 * One transaction on purpose. Split apart, a failure between the two writes either
 * burns an allowance that produced no like (the visitor is short-changed with no
 * way to tell) or records a like nobody paid for (the cap silently leaks). Neither
 * is recoverable after the fact, because there is no identity to reconcile against.
 *
 * The increment is a single `likes = likes + 1` — never fetch-then-write, which
 * loses concurrent likes. It follows the shape `bumpViews` already established.
 */
export async function claimLike(args: {
  kind: LikeKind;
  id: string;
  itemKey: string;
  ipKey: string;
  now: Date;
}): Promise<LikeResult> {
  const day = utcDay(args.now);

  // A denial has to unwind the writes already made in this transaction, and the
  // only way out of a Drizzle transaction callback that rolls back is to throw.
  // (`tx.rollback()` throws too — so anything after it is dead code and the caller
  // gets a rejected promise instead of a verdict.) A private sentinel carries the
  // reason out and is re-read below; nothing else can produce one.
  class Denied extends Error {
    constructor(readonly reason: "item-cap" | "ip-cap" | "missing") {
      super(reason);
    }
  }

  try {
    return await db.transaction(async (tx) => {
      // Per-IP ceiling first: it is the cheaper rejection and the one an abuser
      // hits, so it fails before we touch the item's row.
      const ip = await bumpGrant(tx, {
        visitorKey: args.ipKey,
        scope: "ip",
        itemKind: "",
        itemId: "",
        day,
        cap: PER_IP_DAILY_CAP,
      });
      if (!ip.ok) throw new Denied("ip-cap");

      const item = await bumpGrant(tx, {
        visitorKey: args.itemKey,
        scope: "item",
        itemKind: args.kind,
        itemId: args.id,
        day,
        cap: PER_ITEM_DAILY_CAP,
      });
      // Unwinds the IP grant too — a like that did not happen must not cost the
      // address anything.
      if (!item.ok) throw new Denied("item-cap");

      const total =
        args.kind === "dashboard"
          ? await bumpBoard(tx, args.id)
          : await bumpFrame(tx, args.id);
      // null = no such board (or a removed one, whose preview 404s too — a like on
      // it would be the only surface still acknowledging it), or a frame name that
      // is not in the registry. Unwinding matters: otherwise probing random ids
      // drains a real visitor's allowance.
      if (total === null) throw new Denied("missing");

      return {
        ok: true as const,
        total,
        remaining: PER_ITEM_DAILY_CAP - item.n,
      };
    });
  } catch (err) {
    if (err instanceof Denied) return { ok: false, reason: err.reason };
    throw err;
  }
}

/** A board's counter already has a row; the like just moves it. */
async function bumpBoard(tx: Tx, id: string): Promise<number | null> {
  const [row] = await tx
    .update(dashboards)
    .set({ likes: sql`${dashboards.likes} + 1` })
    .where(and(eq(dashboards.id, id), ne(dashboards.status, "removed")))
    .returning({ total: dashboards.likes });
  return row?.total ?? null;
}

/**
 * A frame's counter does NOT have a row until someone likes it, so this upserts —
 * one statement, never select-then-branch, which would let two first-likers race
 * and one of them lose to a duplicate-key error.
 *
 * The name is checked against the registry FIRST because, unlike a board id, it is
 * a client-supplied string with no row to validate it. Skipping the check would let
 * the table fill with typos and probes that then render as real frames in the
 * catalogue's counts payload.
 *
 * `allFrameMetas` (not `allFrames`, and above all not `@zframes/frames/lazy`) is the
 * safe import here: the lazy loaders are `() => import(...)` thunks that Next's
 * bundler follows into the server graph, and the build dies on the first frame using
 * `useState`. validate-spec.ts imports the same module for the same reason.
 */
async function bumpFrame(tx: Tx, name: string): Promise<number | null> {
  if (!FRAME_NAMES.has(name)) return null;
  const [row] = await tx
    .insert(frameLikes)
    .values({ name, likes: 1 })
    .onConflictDoUpdate({
      target: frameLikes.name,
      set: { likes: sql`${frameLikes.likes} + 1` },
    })
    .returning({ total: frameLikes.likes });
  return row?.total ?? null;
}

/**
 * Every frame's like count, as one map. ONE call for the whole catalogue rather
 * than a request per card: 255 frames against a mostly-empty table is a tiny
 * payload, and 255 requests is not.
 *
 * Absent rows are simply absent — the caller renders a missing key as 0, which is
 * the same thing a zero row would say.
 */
export async function allFrameLikes(): Promise<Record<string, number>> {
  const rows = await db
    .select({ name: frameLikes.name, likes: frameLikes.likes })
    .from(frameLikes);
  const out: Record<string, number> = {};
  // Filtered against the registry on the way OUT too, not just on write. A row
  // outlives its frame: rename or remove a frame and its counts stay, so an
  // unfiltered map put a retired name in the catalogue's most-liked strip, whose
  // chip links to `?q=<old-name>` and lands on "No frames match".
  for (const r of rows) {
    if (r.likes > 0 && FRAME_NAMES.has(r.name)) out[r.name] = r.likes;
  }
  return out;
}

/**
 * Burn one unit of an allowance. The cap is enforced **in the WHERE clause**, not
 * by reading then deciding: an `INSERT … ON CONFLICT DO UPDATE … WHERE n < cap`
 * cannot be raced, whereas a select-then-update lets two concurrent requests both
 * observe `n = 4` and both proceed. Zero rows affected means the cap is spent.
 */
async function bumpGrant(
  tx: Tx,
  g: {
    visitorKey: string;
    scope: string;
    itemKind: string;
    itemId: string;
    day: string;
    cap: number;
  },
): Promise<{ ok: boolean; n: number }> {
  const [row] = await tx
    .insert(likeGrants)
    .values({
      visitorKey: g.visitorKey,
      scope: g.scope,
      itemKind: g.itemKind,
      itemId: g.itemId,
      day: g.day,
      n: 1,
    })
    .onConflictDoUpdate({
      target: [
        likeGrants.visitorKey,
        likeGrants.scope,
        likeGrants.itemKind,
        likeGrants.itemId,
        likeGrants.day,
      ],
      set: { n: sql`${likeGrants.n} + 1` },
      setWhere: sql`${likeGrants.n} < ${g.cap}`,
    })
    .returning({ n: likeGrants.n });
  return row ? { ok: true, n: row.n } : { ok: false, n: g.cap };
}

/**
 * Drop day-buckets nothing will read again. Called by the nightly cron rather than
 * on the request path — a delete per like would add write work to the hot path to
 * save a job that runs once a day.
 */
export async function sweepLikeGrants(now: Date): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - GRANT_RETENTION_DAYS);
  const rows = await db
    .delete(likeGrants)
    // `lte`, not `lt`. With `lt` the cutoff bucket itself survived, so the sweep kept
    // THREE day-buckets while the constant and the migration comment both said two —
    // visitor-fingerprint rows living ~72h against a stated 48h window.
    .where(lte(likeGrants.day, utcDay(cutoff)))
    .returning({ day: likeGrants.day });
  return rows.length;
}

/** Unused today; kept next to the writer so the read path is obvious for 004. */
export async function likeCountFor(id: string): Promise<number> {
  const [row] = await db
    .select({ likes: dashboards.likes })
    .from(dashboards)
    .where(and(eq(dashboards.id, id)))
    .limit(1);
  return row?.likes ?? 0;
}
