// CSRF defense-in-depth for the app's OWN mutating routes. Better Auth's origin
// guard only covers /api/auth/*; publish/delete rely on the
// session cookie being SameSite=Lax (the framework default) — safe today, but a
// single implicit dependency. A cross-site attack carries the attacker's Origin,
// which won't match Host → rejected here. Non-browser callers (curl/CLI) send no
// Origin and are allowed; they still need the session cookie for authz.
//
// ⚠️ THAT LAST SENTENCE STOPPED BEING UNIVERSALLY TRUE when `/api/likes` shipped —
// the app's first UNAUTHENTICATED mutating route. There is no session cookie behind
// it, so the no-Origin carve-out is a full bypass rather than a caller who still has
// to authenticate. For that route this check is CSRF hygiene only; what bounds abuse
// is the per-visitor and per-IP day caps in `likes.ts`. Do not add another
// unauthenticated write and assume this function guards it.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
