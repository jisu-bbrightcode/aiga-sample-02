/**
 * Boundary validation (zod). All external input is validated here before it
 * reaches the service. Fail fast with clear messages; never trust client data.
 */
import { z } from "zod";

import { RATING_MAX, RATING_MIN } from "./types.js";

const TITLE_MAX = 150;
const BODY_MAX = 4000;

const ratingSchema = z.coerce
  .number()
  .int("Rating must be a whole number.")
  .min(RATING_MIN)
  .max(RATING_MAX);

const titleSchema = z
  .string()
  .trim()
  .max(TITLE_MAX)
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

const bodySchema = z.string().trim().min(1).max(BODY_MAX);

/** POST /profiles/:targetUserId/reviews */
export const createReviewSchema = z.object({
  rating: ratingSchema,
  title: titleSchema,
  body: bodySchema,
});

/**
 * PATCH /reviews/:id — every field optional, but at least one must be present so
 * an empty update is rejected rather than silently no-op'ing.
 */
export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    title: titleSchema,
    body: bodySchema.optional(),
  })
  .refine(
    (v) => v.rating !== undefined || v.body !== undefined || v.title !== undefined,
    { message: "Provide at least one field to update." },
  );

export const listReviewsQuerySchema = z.object({
  sort: z.enum(["recent", "rating_desc", "rating_asc"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateReviewBody = z.infer<typeof createReviewSchema>;
export type UpdateReviewBody = z.infer<typeof updateReviewSchema>;
export type ListReviewsQueryInput = z.infer<typeof listReviewsQuerySchema>;
