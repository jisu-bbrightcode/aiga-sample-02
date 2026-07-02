-- Review & Rating — initial migration (BBR-1139)
-- Additive: creates only review objects. Safe to apply after the base schema
-- (BBR-1117) and auth/membership schema (BBR-1121) land. Idempotent.

DO $$ BEGIN
  CREATE TYPE "review_status" AS ENUM ('active', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "target_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "author_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "title" text,
  "body" text NOT NULL,
  "status" "review_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  -- Star rating domain: 1..5 inclusive.
  CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  -- 본인 프로필 제외 — a member cannot review their own profile.
  CONSTRAINT "reviews_not_self" CHECK ("author_id" <> "target_user_id")
);

-- At most one *active* review per (author, target); edits reuse the same row,
-- while soft-deleted rows are excluded so the author can review again later.
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_author_target_active_uidx"
  ON "reviews" ("author_id", "target_user_id")
  WHERE ("status" = 'active');

-- List / aggregate by target, and sort by recency.
CREATE INDEX IF NOT EXISTS "reviews_target_idx" ON "reviews" ("target_user_id", "status");
CREATE INDEX IF NOT EXISTS "reviews_target_created_idx" ON "reviews" ("target_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "reviews_author_idx" ON "reviews" ("author_id");
