import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../../db/schema/auth.js";

/**
 * Review & Rating — persistence schema (Drizzle / Postgres).
 *
 * Extends the base `reviews` concept (reuse source:
 * product-builder-base:packages/drizzle/src/schema/core/reviews.ts). The base
 * repo/ref could not be verified at build time (PB-BASE-001), so this is an
 * EXTEND/NEW implementation aligned to the local domain model:
 *
 *  - A review targets a member *profile* (`target_user_id` -> `user.id`), matching
 *    the product rule "대상별 리뷰" (per-target reviews) and "본인 프로필 제외"
 *    (a member may not review their own profile).
 *  - Authorship is restricted to 의사인증회원 (verified doctors); that rule is
 *    enforced in the service layer via the membership tier, not in the table.
 *  - Ratings are integers 1..5; aggregation (average / count / distribution) is
 *    computed over `status = 'active'` rows.
 *
 * Deletes are soft (status = 'deleted') so aggregates stay correct and history is
 * retained for moderation/audit.
 */

export const reviewStatus = pgEnum("review_status", ["active", "deleted"]);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // The reviewed member's profile (a user). Reviews are surfaced per target.
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // The review author. Must be a verified doctor (checked in the service).
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Star rating, 1..5 (see check constraint below).
    rating: integer("rating").notNull(),

    // Optional short headline plus the review body.
    title: text("title"),
    body: text("body").notNull(),

    status: reviewStatus("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when soft-deleted; null while active.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    // Rating domain: 1..5 inclusive.
    ratingRange: check("reviews_rating_range", sql`${table.rating} between 1 and 5`),
    // 본인 프로필 제외 — a member cannot review their own profile.
    notSelf: check("reviews_not_self", sql`${table.authorId} <> ${table.targetUserId}`),
    // At most one *active* review per (author, target); edits reuse the same row.
    uniqueActive: uniqueIndex("reviews_author_target_active_uidx")
      .on(table.authorId, table.targetUserId)
      .where(sql`${table.status} = 'active'`),
    // List/aggregate by target (active first) and sort by recency.
    targetIdx: index("reviews_target_idx").on(table.targetUserId, table.status),
    targetCreatedIdx: index("reviews_target_created_idx").on(
      table.targetUserId,
      table.createdAt,
    ),
    authorIdx: index("reviews_author_idx").on(table.authorId),
  }),
);

export type ReviewRow = typeof reviews.$inferSelect;
export type NewReviewRow = typeof reviews.$inferInsert;
