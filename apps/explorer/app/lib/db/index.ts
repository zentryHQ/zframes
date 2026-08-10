import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One driver everywhere: the plain `postgres` client over DATABASE_URL.
//  • dev  → Postgres in Docker on :5433 (apps/explorer/docker-compose.yml)
//  • prod → Neon
// Both are a real Postgres of the same major, so dev mirrors prod exactly.
// Trimmed: a platform env var pasted with a stray space or newline otherwise
// fails deep inside the driver as ERR_INVALID_URL with the value masked.
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Dev: run `pnpm db:up` and set DATABASE_URL in .env.local.",
  );
}

// Reuse one pool + one drizzle instance across Next hot reloads.
const globalForDb = globalThis as unknown as {
  __zfSql?: ReturnType<typeof postgres>;
  __zfDb?: PostgresJsDatabase<typeof schema>;
};

// The default pool, in dev as in prod. This used to clamp to `max: 1` against
// :5433, because the PGlite socket server that lived there accepted ONE wire
// connection and a normal pool raced it into random `read ECONNRESET` "Failed
// query" errors. Docker Postgres replaced it (2026-08-10) and the clamp went with
// it — note it could not simply have been left in place, since the Docker
// database answers on the same host:port and would have inherited it.
const client =
  globalForDb.__zfSql ??
  (globalForDb.__zfSql = postgres(url, { prepare: false }));
export const db =
  globalForDb.__zfDb ?? (globalForDb.__zfDb = drizzle(client, { schema }));
export { schema };
