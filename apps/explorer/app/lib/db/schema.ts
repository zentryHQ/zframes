import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ── Better Auth core tables ──────────────────────────────────────────────────
// camelCase JS field names (what Better Auth's Drizzle adapter maps to) over
// snake_case DB columns. Shape matches Better Auth v1.x defaults.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── zframes dashboards ───────────────────────────────────────────────────────
// One row per dashboard — community publishes AND the curated showcase, which
// moved out of `app/lib/curated-dashboards.ts` and into this table (2026-08-05).
// Community rows are immutable-per-publish: publishing again mints a new id (an
// "update" is a new row), so a shared link is a stable snapshot. Curated rows are
// the exception — they are upserted by id, because a curated board's URL is its
// slug (`/d/gold-desk`) and must survive an edit.
//
// The three curated-only columns below are what let one table serve both. A
// community row leaves all three at their defaults, so nothing about publishing
// changed.

export const dashboards = pgTable("dashboards", {
  id: text("id").primaryKey(), // community: nanoid · curated: a readable slug
  // Nullable BECAUSE of curated rows: a showcase board has no user behind it, and
  // inventing a synthetic "zframes" row in Better Auth's `user` table to satisfy
  // a FK would put a fake account in the auth system to model authorship that
  // doesn't exist. `listByOwner` filters by a real id, so null rows never match.
  ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  spec: jsonb("spec").notNull(), // the DashboardSpec (validated before insert)
  // Curated only: the editorial one-liner the gallery searches and shows. A
  // community publish has no field for it in the UI, so it stays null.
  description: text("description"),
  // True for the editorial showcase. Drives the gallery's two sections and marks
  // the rows the seeder owns (it upserts by id and would otherwise have no way to
  // tell its own rows from a user's).
  curated: boolean("curated").notNull().default(false),
  // Curated only: position in the landing page's sticky card stack, or null to
  // appear in the gallery but not on the front door. Replaces the old
  // `LANDING_IDS` array — an ORDER, so the sequence is data rather than the
  // literal order of a hand-written list.
  landingOrder: integer("landing_order"),
  visibility: text("visibility").notNull().default("unlisted"), // listed | unlisted
  // Publishing is open (no review queue / admin UI). `status` stays as the
  // operator's SQL-only takedown lever: set "removed" and the dashboard drops
  // from the gallery AND its preview/raw-spec 404 (see dashboards.ts filters).
  status: text("status").notNull().default("approved"), // approved | removed
  tags: text("tags").array().notNull().default([]),
  views: integer("views").notNull().default(0),
  forks: integer("forks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DashboardRow = typeof dashboards.$inferSelect;

// ── nightly dashboard screenshots ────────────────────────────────────────────
// Real browser captures of /dashboard/[id], refreshed by scripts/capture-thumbs.ts on a
// nightly cron. A SEPARATE table (not a column on `dashboards`) so gallery
// queries (listCommunity/listByOwner select full rows) never drag image blobs
// over the wire. Keyed by dashboard id — covers BOTH community rows and the
// static curated ids (which have no `dashboards` row). No FK on purpose.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const dashboardThumbs = pgTable("dashboard_thumbs", {
  id: text("id").primaryKey(), // dashboard id (curated slug or nanoid)
  image: bytea("image").notNull(),
  contentType: text("content_type").notNull().default("image/jpeg"),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});

// ── migration bookkeeping ────────────────────────────────────────────────────
// One row per applied file in `drizzle/`. WRITTEN AND CREATED BY
// scripts/migrate.ts, not by a migration — it has to exist before the first
// migration can be recorded, so the runner bootstraps it with
// `create table if not exists`.
//
// Declared here anyway, and that matters: a schema-diff tool compares this file
// against the live database, and a table missing from here reads as "drop it".
// `drizzle-kit push` did exactly that — it offered to delete this table, and with
// it the entire record of which migrations had run. Keeping the declaration is
// what makes `pnpm check:schema` (and any future diff) clean without a
// maintained exclusion list.
export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(), // the .sql filename
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
