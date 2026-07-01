import { headers } from "next/headers";
import { auth } from "@/app/lib/auth";

// Server-side session (route handlers, server components). Returns the signed-in
// user or null. Better Auth's session cookie is sameSite=lax, so a cross-site
// POST won't carry it — an unauthenticated write is simply rejected below.
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
