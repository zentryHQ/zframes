// Admin gate for moderation. ADMIN_EMAILS is a comma-separated allowlist of
// signed-in emails permitted to review reports + take dashboards down.
//
// CRITICAL: require emailVerified. Email/password sign-up doesn't verify the
// address, so without this an attacker could register an account using an
// admin's allowlisted email and inherit admin power. A verified email (OAuth
// sets it true; email verification otherwise) is the trust anchor. No role
// table for now — the env allowlist + verified email is enough.
export function isAdmin(
  user:
    | { email?: string | null; emailVerified?: boolean | null }
    | null
    | undefined,
): boolean {
  if (!user?.email || user.emailVerified !== true) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}
