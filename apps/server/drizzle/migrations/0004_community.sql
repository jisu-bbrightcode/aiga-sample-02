-- Community — 커뮤니티/게시글/댓글/반응/모더레이션 (BBR-1168)
-- Additive + idempotent: creates only community objects. Safe to apply after the
-- base schema (BBR-1117), auth/membership (BBR-1121), and sibling features.
-- References the better-auth "user" table (text ids).

-- --- Enums ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "community_post_status" AS ENUM ('active', 'removed', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "community_comment_status" AS ENUM ('active', 'removed', 'deleted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "community_reaction_kind" AS ENUM ('like', 'upvote', 'downvote');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --- Posts (게시글) ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "author_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text,
  "status" "community_post_status" NOT NULL DEFAULT 'active',
  "pinned" boolean NOT NULL DEFAULT false,
  "locked" boolean NOT NULL DEFAULT false,
  "crosspost_of" uuid,
  "view_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "community_posts_status_created_idx"
  ON "community_posts" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "community_posts_category_idx"
  ON "community_posts" ("category");
CREATE INDEX IF NOT EXISTS "community_posts_author_idx"
  ON "community_posts" ("author_id");

-- --- Comments (댓글) ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "community_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "author_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "status" "community_comment_status" NOT NULL DEFAULT 'active',
  "sticky" boolean NOT NULL DEFAULT false,
  "distinguished" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "community_comments_post_status_idx"
  ON "community_comments" ("post_id", "status");
CREATE INDEX IF NOT EXISTS "community_comments_author_idx"
  ON "community_comments" ("author_id");

-- --- Reactions (반응/추천) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "community_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind" "community_reaction_kind" NOT NULL DEFAULT 'like',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- At most one reaction per (post, user): idempotency + count = row count.
CREATE UNIQUE INDEX IF NOT EXISTS "community_reactions_post_user_uidx"
  ON "community_reactions" ("post_id", "user_id");
CREATE INDEX IF NOT EXISTS "community_reactions_post_idx"
  ON "community_reactions" ("post_id");

-- --- Moderation audit log (관리자 모더레이션) --------------------------------
CREATE TABLE IF NOT EXISTS "community_moderation_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "community_moderation_target_idx"
  ON "community_moderation_log" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "community_moderation_actor_idx"
  ON "community_moderation_log" ("actor_id");

-- --- Post views (등급별 열람 일일 제한) --------------------------------------
CREATE TABLE IF NOT EXISTS "community_post_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bucket_key" text NOT NULL,
  "post_id" uuid NOT NULL,
  "viewed_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "community_post_views_bucket_window_idx"
  ON "community_post_views" ("bucket_key", "viewed_at");
CREATE INDEX IF NOT EXISTS "community_post_views_bucket_post_idx"
  ON "community_post_views" ("bucket_key", "post_id", "viewed_at");
