-- 0000 · baseline
--
-- The whole schema as of 2026-08-05, when this app adopted versioned migrations.
-- Generated from app/lib/db/schema.ts with `drizzle-kit generate`, then made
-- IDEMPOTENT by hand (`IF NOT EXISTS` everywhere) for one specific reason:
-- production and every existing dev database already have these tables, created
-- by the `drizzle-kit push` this replaces. A plain CREATE TABLE baseline would
-- fail on the first run against any of them.
--
-- So this file is both "create the world" for a fresh database and a no-op for an
-- existing one. That is what lets `pnpm migrate` be the single entry point
-- everywhere, instead of `push` for new databases and migrations for old ones.
--
-- Constraints are added separately and guarded, because Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`.

CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- `owner_id` is nullable and the three curated columns are present here because
-- this baseline describes the CURRENT schema. An existing database gets them from
-- 0001 instead; a fresh one gets them right here and 0001 is a no-op.
CREATE TABLE IF NOT EXISTS "dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"description" text,
	"curated" boolean DEFAULT false NOT NULL,
	"landing_order" integer,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dashboard_thumbs" (
	"id" text PRIMARY KEY NOT NULL,
	"image" "bytea" NOT NULL,
	"content_type" text DEFAULT 'image/jpeg' NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys, each guarded: Postgres has no ADD CONSTRAINT IF NOT EXISTS, and
-- re-adding an existing one is an error rather than a no-op.
DO $$ BEGIN
	ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_id_user_id_fk"
		FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
