import { SITE_NAME } from "@/app/lib/site";

/**
 * The account the house boards are published under.
 *
 * The gallery is ONE list since 2026-08-28 — there is no curated section any
 * more, every board is a board. That merge is what forced this row to exist: in
 * a single grid where every card carries a byline, the boards we build ourselves
 * cannot be the three with a blank one. `curated` survives as a flag (it still
 * orders the landing stack and marks the rows the seeder owns), but it is no
 * longer a *kind* of board, so authorship stops being optional.
 *
 * A real `user` row rather than a client-side "if null, say zframes" fallback
 * because the fallback has to be re-implemented in every surface that ever shows
 * an author, and each one is a chance to disagree with the others. One row makes
 * `dashboards.ownerId → user.id` mean the same thing for all 18 house boards as
 * it does for a community publish, and the byline component stays a dumb render
 * of whatever the query returned.
 *
 * **It cannot be signed into.** Better Auth requires a matching `account` row to
 * authenticate, and this row has none — Google is the only sign-in method, so
 * there is no password or credential path to it either. The address is on a
 * `.invalid` domain (RFC 2606, permanently unresolvable) precisely so it can
 * never collide with a real Google account signing in: `user.email` is unique,
 * and a collision there would break sign-in for the person who owns the address,
 * not for us.
 *
 * Seeded by `drizzle/0005_house_author.sql` (which also back-fills the existing
 * curated rows) and re-asserted by `upsertCurated` on every seed run, so a fresh
 * database and a migrated production converge on the same row.
 */
export const HOUSE_USER = {
  id: "zframes-house",
  name: SITE_NAME,
  email: "house@zframes.invalid",
  /** Site-relative on purpose — the byline renders it from this same origin, so
   *  unlike a provider avatar it needs no remote-image allowlist. */
  image: "/zframes-icon-512.png",
} as const;
