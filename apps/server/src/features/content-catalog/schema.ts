import {
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

import { CONTENT_STATUSES } from "./types.js";

/**
 * Content Catalog — persistence schema (Drizzle / PostgreSQL). PROVISIONAL.
 *
 * Additive relative to the base (BBR-1117) and auth/membership (BBR-1121):
 *  - content_status enum (sourced from the domain model, single source of truth)
 *  - content_categories: self-referencing category tree
 *  - content_items: the core catalog entity
 *
 * `author_id` references the better-auth `user` table owned by BBR-1121. It is a
 * plain uuid (no cross-feature FK) so this migration stays orderable independent
 * of the auth migration; a FK can be added once table ordering is finalized.
 */
export const contentStatus = pgEnum("content_status", CONTENT_STATUSES);

export const contentCategories = pgTable(
  "content_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("content_categories_slug_unique").on(table.slug),
    parentIdx: index("content_categories_parent_idx").on(table.parentId),
  }),
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    categoryId: uuid("category_id").references(() => contentCategories.id, {
      onDelete: "set null",
    }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: contentStatus("status").notNull().default("draft"),
    authorId: uuid("author_id").notNull(),
    coverImageUrl: text("cover_image_url"),
    viewCount: integer("view_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    slugUnique: uniqueIndex("content_items_slug_unique").on(table.slug),
    statusIdx: index("content_items_status_idx").on(table.status),
    categoryIdx: index("content_items_category_idx").on(table.categoryId),
    authorIdx: index("content_items_author_idx").on(table.authorId),
    publishedAtIdx: index("content_items_published_at_idx").on(table.publishedAt),
  }),
);

export type ContentRow = typeof contentItems.$inferSelect;
export type NewContentRow = typeof contentItems.$inferInsert;
export type CategoryRow = typeof contentCategories.$inferSelect;
export type NewCategoryRow = typeof contentCategories.$inferInsert;
