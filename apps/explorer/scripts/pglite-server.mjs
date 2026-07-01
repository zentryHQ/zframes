// Local dev database: a PGlite instance (persisted to .pglite) exposed over the
// Postgres wire protocol on 127.0.0.1:5433. The Next app + drizzle-kit connect to
// it with the plain `postgres` driver via DATABASE_URL — exactly as they'll
// connect to Neon in prod. Running PGlite in its own clean Node process (not
// inside Next's bundle) sidesteps the WASM-in-Next loading issues.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dir = process.env.PGLITE_DIR ?? "./.pglite";
const db = await PGlite.create(dir);
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log(`PGlite socket server on postgres://127.0.0.1:5433 (dir: ${dir})`);
