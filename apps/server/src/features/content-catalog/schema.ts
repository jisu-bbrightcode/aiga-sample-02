import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { CONTENT_CATEGORIES, CONTENT_STATUSES } from "./types.js";

/**
 * Content Catalog — persistence schema (Drizzle / PostgreSQL).
 *
 * Implements the LOCKED `ContentItem` contract
 * (BBR-1144#document-entity-contract): a single `content_items` table with a
 * `notice|free|qna` category enum, a `draft|published|hidden` status enum, a
 * `conditionTags` facet, view/like/report counts and `deletedAt` soft delete.
 * There is no category tree and no slug — detail is addressed by id.
 *
 * `author_id` references the better-auth `user` table owned by BBR-1121. It is a
 * plain uuid (no cross-feature FK) so this migration stays orderable independent
 * of the auth migration; a FK can be added once table ordering is finalized.
 */
export const contentStatus = pgEnum("content_status", CONTENT_STATUSES);
export const contentCategory = pgEnum("content_category", CONTENT_CATEGORIES);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    category: contentCategory("category").notNull(),
    conditionTags: jsonb("condition_tags").$type<string[]>().notNull().default([]),
    coverImageUrl: text("cover_image_url"),
    status: contentStatus("status").notNull().default("draft"),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    reportCount: integer("report_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    statusCreatedIdx: index("content_items_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    statusCategoryIdx: index("content_items_status_category_idx").on(
      table.status,
      table.category,
    ),
    statusLikeIdx: index("content_items_status_like_idx").on(table.status, table.likeCount),
    authorIdx: index("content_items_author_idx").on(table.authorId),
    conditionTagsIdx: index("content_items_condition_tags_idx")
      .using("gin", table.conditionTags),
  }),
);

export type ContentRow = typeof contentItems.$inferSelect;
export type NewContentRow = typeof contentItems.$inferInsert;
