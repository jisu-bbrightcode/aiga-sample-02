/**
 * Boundary validation (zod). All external input is validated here before it
 * reaches the service. Fail fast with clear messages; never trust client data.
 */
import { z } from "zod";
import { CONTENT_STATUSES } from "./types.js";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** URL-safe slug: lowercase letters, digits and single hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case (a-z, 0-9, -).");

const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((tags) => Array.from(new Set(tags)));

export const createContentSchema = z.object({
  title: trimmed(200),
  summary: z.string().trim().max(500).default(""),
  body: z.string().max(100_000).default(""),
  slug: slugSchema.optional(),
  categoryId: z.string().uuid().nullish().transform((v) => v ?? null),
  tags: tagsSchema.optional(),
  coverImageUrl: z.string().url().max(2048).nullish().transform((v) => v ?? null),
});

export const updateContentSchema = z
  .object({
    title: trimmed(200),
    summary: z.string().trim().max(500),
    body: z.string().max(100_000),
    slug: slugSchema,
    categoryId: z.string().uuid().nullable(),
    tags: tagsSchema,
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
  .enum(["newest", "oldest", "popular", "title"])
  .default("newest");

/** Public / member list query. */
export const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  sort: contentSortSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** Admin list query adds status + author filters and soft-deleted visibility. */
export const adminListQuerySchema = listQuerySchema.extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  authorId: z.string().uuid().optional(),
  includeDeleted: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const searchQuerySchema = listQuerySchema.extend({
  q: trimmed(200),
});

export const createCategorySchema = z.object({
  slug: slugSchema,
  name: trimmed(120),
  description: z.string().trim().max(500).nullish().transform((v) => v ?? null),
  parentId: z.string().uuid().nullish().transform((v) => v ?? null),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const updateCategorySchema = z
  .object({
    slug: slugSchema,
    name: trimmed(120),
    description: z.string().trim().max(500).nullable(),
    parentId: z.string().uuid().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(10_000),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field must be provided.",
  });

export type CreateContentBody = z.infer<typeof createContentSchema>;
export type UpdateContentBody = z.infer<typeof updateContentSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SetStatusBody = z.infer<typeof setStatusSchema>;
export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;
