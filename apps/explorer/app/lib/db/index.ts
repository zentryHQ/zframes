import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One driver everywhere: the plain `postgres` client over DATABASE_URL.
//  • dev  → the local PGlite socket server (scripts/pglite-server.mjs on :5433)
//  • prod → Neon
// PGlite never enters the Next bundle (it lives only in the dev socket process),
// so there's no WASM-in-Next to fight, and dev mirrors prod exactly.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Dev: start `node scripts/pglite-server.mjs` and set DATABASE_URL in .env.local.",
  );
}

// Reuse one pool + one drizzle instance across Next hot reloads.
const globalForDb = globalThis as unknown as {
  __zfSql?: ReturnType<typeof postgres>;
  __zfDb?: PostgresJsDatabase<typeof schema>;
};

const client =
  globalForDb.__zfSql ??
  (globalForDb.__zfSql = postgres(url, { prepare: false }));
export const db =
  globalForDb.__zfDb ?? (globalForDb.__zfDb = drizzle(client, { schema }));
export { schema };
