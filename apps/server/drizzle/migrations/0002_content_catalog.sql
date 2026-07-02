-- Content Catalog — initial migration (BBR-1145, refactored to the locked
-- ContentItem contract in BBR-1176 / BBR-1144#document-entity-contract).
--
-- Additive: creates only content-catalog objects. Safe to apply after the base
-- schema (BBR-1117) and auth/membership schema (BBR-1121) land. Idempotent so
-- it can be re-run and applied in any order relative to sibling features.
--
-- Locked contract highlights:
--   * status enum is exactly draft | published | hidden (no pending_review /
--     archived / rejected; `reported` is derived from report_count, `deleted`
--     from deleted_at).
--   * category enum is notice | free | qna (no category tree, no slug).
--   * condition_tags is an orthogonal jsonb facet; counts are first-class.

DO $$ BEGIN
  CREATE TYPE "content_status" AS ENUM ('draft', 'published', 'hidden');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "content_category" AS ENUM ('notice', 'free', 'qna');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "author_id" uuid NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "category" "content_category" NOT NULL,
  "condition_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cover_image_url" text,
  "status" "content_status" NOT NULL DEFAULT 'draft',
  "view_count" integer NOT NULL DEFAULT 0,
  "like_count" integer NOT NULL DEFAULT 0,
  "report_count" integer NOT NULL DEFAULT 0,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "content_items_status_created_idx"
  ON "content_items" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "content_items_status_category_idx"
  ON "content_items" ("status", "category");
CREATE INDEX IF NOT EXISTS "content_items_status_like_idx"
  ON "content_items" ("status", "like_count");
CREATE INDEX IF NOT EXISTS "content_items_author_idx"
  ON "content_items" ("author_id");
CREATE INDEX IF NOT EXISTS "content_items_condition_tags_idx"
  ON "content_items" USING gin ("condition_tags");
