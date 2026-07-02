-- Content Catalog — initial migration (BBR-1145)
-- Additive: creates only content-catalog objects. Safe to apply after the base
-- schema (BBR-1117) and auth/membership schema (BBR-1121) land. Idempotent so
-- it can be re-run and applied in any order relative to sibling features.

DO $$ BEGIN
  CREATE TYPE "content_status" AS ENUM ('draft', 'pending_review', 'published', 'archived', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "content_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "parent_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "content_categories_slug_unique" ON "content_categories" ("slug");
CREATE INDEX IF NOT EXISTS "content_categories_parent_idx" ON "content_categories" ("parent_id");

CREATE TABLE IF NOT EXISTS "content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "category_id" uuid REFERENCES "content_categories" ("id") ON DELETE SET NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" "content_status" NOT NULL DEFAULT 'draft',
  "author_id" uuid NOT NULL,
  "cover_image_url" text,
  "view_count" integer NOT NULL DEFAULT 0,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "content_items_slug_unique" ON "content_items" ("slug");
CREATE INDEX IF NOT EXISTS "content_items_status_idx" ON "content_items" ("status");
CREATE INDEX IF NOT EXISTS "content_items_category_idx" ON "content_items" ("category_id");
CREATE INDEX IF NOT EXISTS "content_items_author_idx" ON "content_items" ("author_id");
CREATE INDEX IF NOT EXISTS "content_items_published_at_idx" ON "content_items" ("published_at");
