import { defineConfig } from "drizzle-kit";

// Pushes over the Postgres wire protocol via DATABASE_URL — dev falls back to the
// local PGlite socket server (:5433); prod: run with DATABASE_URL=<neon> set.
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/lib/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@127.0.0.1:5433/postgres",
  },
});
