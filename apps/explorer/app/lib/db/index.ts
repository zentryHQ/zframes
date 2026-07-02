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

// The dev PGlite socket server handles ONE wire connection at a time — a
// default 10-connection pool makes concurrent renders race it and surface as
// random `read ECONNRESET` "Failed query" errors. Serialize through a single
// connection against the local socket; Neon (prod) keeps the normal pool.
const isPgliteSocket = /127\.0\.0\.1:5433|localhost:5433/.test(url);
const client =
  globalForDb.__zfSql ??
  (globalForDb.__zfSql = postgres(url, {
    prepare: false,
    // idle_timeout releases the one dev connection between requests so
    // drizzle-kit push / ad-hoc scripts can share the socket.
    ...(isPgliteSocket ? { max: 1, idle_timeout: 3 } : {}),
  }));
export const db =
  globalForDb.__zfDb ?? (globalForDb.__zfDb = drizzle(client, { schema }));
export { schema };
