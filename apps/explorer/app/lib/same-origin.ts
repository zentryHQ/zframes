// CSRF defense-in-depth for the app's OWN mutating routes. Better Auth's origin
// guard only covers /api/auth/*; publish/delete/report/moderate rely on the
// session cookie being SameSite=Lax (the framework default) — safe today, but a
// single implicit dependency. A cross-site attack carries the attacker's Origin,
// which won't match Host → rejected here. Non-browser callers (curl/CLI) send no
// Origin and are allowed; they still need the session cookie for authz.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
