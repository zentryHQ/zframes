import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/app/lib/auth";

// Better Auth needs Node (Drizzle + PGlite/postgres are not Edge-safe).
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
