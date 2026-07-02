/**
 * Boundary validation (zod). All external input is validated here before it
 * reaches the service. Fail fast with clear messages; never trust client data.
 *
 * Contract: BBR-1144#document-entity-contract (LOCKED).
 */
import { z } from "zod";
import { CONTENT_CATEGORIES, CONTENT_STATUSES } from "./types.js";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** Content category (board type) — locked enum. */
export const contentCategorySchema = z.enum(CONTENT_CATEGORIES);

/** Free-form disease/condition facet tags; de-duplicated, capped at 20. */
const conditionTagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((tags) => Array.from(new Set(tags)));

export const createContentSchema = z.object({
  title: trimmed(200),
  body: z.string().max(100_000).default(""),
  category: contentCategorySchema,
  conditionTags: conditionTagsSchema.optional(),
  coverImageUrl: z.string().url().max(2048).nullish().transform((v) => v ?? null),
});

export const updateContentSchema = z
  .object({
    title: trimmed(200),
    body: z.string().max(100_000),
    category: contentCategorySchema,
    conditionTags: conditionTagsSchema,
    coverImageUrl: z.string().url().max(2048).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field must be provided.",
  });

export const setStatusSchema = z.object({
  status: z.enum(CONTENT_STATUSES),
});

export const contentSortSchema = z
  .enum(["latest", "popular", "views"])
  .default("latest");

const boolFromQuery = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((v) => v === true || v === "true");

/** Public / member list query. */
export const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: contentCategorySchema.optional(),
  conditionTag: z.string().trim().min(1).max(40).optional(),
  sort: contentSortSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** Admin list query adds status/author/report filters + soft-deleted visibility. */
export const adminListQuerySchema = listQuerySchema.extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  authorId: z.string().uuid().optional(),
  reported: boolFromQuery,
  includeDeleted: boolFromQuery,
});

export const searchQuerySchema = listQuerySchema.extend({
  q: trimmed(200),
});

export type CreateContentBody = z.infer<typeof createContentSchema>;
export type UpdateContentBody = z.infer<typeof updateContentSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SetStatusBody = z.infer<typeof setStatusSchema>;
