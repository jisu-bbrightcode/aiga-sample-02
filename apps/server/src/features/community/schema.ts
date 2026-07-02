import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../../db/schema/auth.js";
import { REACTION_KINDS } from "./types.js";

/**
 * Community — persistence schema (Drizzle / Postgres).
 *
 * Ported to the product stack from the community BE that originally shipped
 * against the wrong repo (BBR-1133). All tables are additive and reference the
 * better-auth `user` table (text ids), matching the sibling features
 * (review-rating / content-catalog).
 *
 *  - Posts/comments use soft lifecycle: `active` (visible), `removed` (moderated,
 *    hidden from members, visible to admins), `deleted` (author soft-delete).
 *  - Reactions are unique per (post, user); the reaction count is the row count.
 *  - The moderation log is an append-only audit trail (records the acting admin).
 *  - Post-view rows back the 등급별 열람 일일 제한 (grade-based daily view limit),
 *    bucketed by user id or client IP.
 */

export const communityPostStatus = pgEnum("community_post_status", [
  "active",
  "removed",
  "deleted",
]);

export const communityCommentStatus = pgEnum("community_comment_status", [
  "active",
  "removed",
  "deleted",
]);

export const communityReactionKind = pgEnum("community_reaction_kind", REACTION_KINDS);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category"),
    status: communityPostStatus("status").notNull().default("active"),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    crosspostOf: uuid("crosspost_of"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    statusCreatedIdx: index("community_posts_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    categoryIdx: index("community_posts_category_idx").on(table.category),
    authorIdx: index("community_posts_author_idx").on(table.authorId),
  }),
);

export const communityComments = pgTable(
  "community_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: communityCommentStatus("status").notNull().default("active"),
    sticky: boolean("sticky").notNull().default(false),
    distinguished: boolean("distinguished").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    postStatusIdx: index("community_comments_post_status_idx").on(
      table.postId,
      table.status,
    ),
    authorIdx: index("community_comments_author_idx").on(table.authorId),
  }),
);

export const communityReactions = pgTable(
  "community_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: communityReactionKind("kind").notNull().default("like"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // At most one reaction per (post, user) — idempotency + count = row count.
    uniquePerUser: uniqueIndex("community_reactions_post_user_uidx").on(
      table.postId,
      table.userId,
    ),
    postIdx: index("community_reactions_post_idx").on(table.postId),
  }),
);

export const communityModerationLog = pgTable(
  "community_moderation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: index("community_moderation_target_idx").on(
      table.targetType,
      table.targetId,
    ),
    actorIdx: index("community_moderation_actor_idx").on(table.actorId),
  }),
);

export const communityPostViews = pgTable(
  "community_post_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucketKey: text("bucket_key").notNull(),
    postId: uuid("post_id").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bucketWindowIdx: index("community_post_views_bucket_window_idx").on(
      table.bucketKey,
      table.viewedAt,
    ),
    bucketPostIdx: index("community_post_views_bucket_post_idx").on(
      table.bucketKey,
      table.postId,
      table.viewedAt,
    ),
  }),
);

export type CommunityPostRow = typeof communityPosts.$inferSelect;
export type CommunityCommentRow = typeof communityComments.$inferSelect;
export type CommunityReactionRow = typeof communityReactions.$inferSelect;
export type CommunityModerationRow = typeof communityModerationLog.$inferSelect;
export type CommunityPostViewRow = typeof communityPostViews.$inferSelect;
