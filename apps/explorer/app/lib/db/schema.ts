import {
  boolean,
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
// One row per published dashboard. Immutable-per-publish: publishing again mints
// a new id (an "update" is a new row), so a shared link is a stable snapshot.
// ownerId → user.id is a real FK (Better Auth users live in this same DB), so
// "my dashboards" + moderation are native joins.

export const dashboards = pgTable("dashboards", {
  id: text("id").primaryKey(), // short id (nanoid)
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  spec: jsonb("spec").notNull(), // the DashboardSpec (validated before insert)
  visibility: text("visibility").notNull().default("unlisted"), // listed | unlisted
  status: text("status").notNull().default("approved"), // pending | approved | removed (Phase 4 moderation)
  tags: text("tags").array().notNull().default([]),
  views: integer("views").notNull().default(0),
  forks: integer("forks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DashboardRow = typeof dashboards.$inferSelect;

// ── moderation ───────────────────────────────────────────────────────────────
// Publish-then-report: anyone can report a listed dashboard; an admin reviews and
// flips dashboards.status to "removed". reporterId is nullable (anonymous reports
// allowed) and set-null on user delete.
export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").references(() => user.id, {
    onDelete: "set null",
  }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ReportRow = typeof reports.$inferSelect;
