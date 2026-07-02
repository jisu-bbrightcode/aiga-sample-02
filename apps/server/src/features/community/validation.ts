/**
 * Boundary validation (zod). All external input is validated here before it
 * reaches the services. Fail fast with clear messages; never trust client data.
 */
import { z } from "zod";

import { REACTION_KINDS } from "./types.js";

const TITLE_MAX = 200;
const BODY_MAX = 20_000;
const COMMENT_MAX = 4_000;
const CATEGORY_MAX = 60;
const REASON_MAX = 500;
const KEYWORD_MAX = 100;

const titleSchema = z.string().trim().min(1, "Title is required.").max(TITLE_MAX);
const bodySchema = z.string().trim().min(1, "Body is required.").max(BODY_MAX);

/** Category on create: optional; blank collapses to null. */
const categorySchema = z
  .string()
  .trim()
  .max(CATEGORY_MAX)
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

/** POST /community/posts */
export const createPostSchema = z.object({
  title: titleSchema,
  body: bodySchema,
  category: categorySchema,
});

/** PATCH /community/posts/:id — every field optional; at least one required. */
export const updatePostSchema = z
  .object({
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    category: z
      .string()
      .trim()
      .max(CATEGORY_MAX)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
  })
  .refine(
    (v) => v.title !== undefined || v.body !== undefined || v.category !== undefined,
    { message: "Provide at least one field to update." },
  );

export const listPostsQuerySchema = z.object({
  sort: z.enum(["recent", "popular"]).default("recent"),
  category: z.string().trim().max(CATEGORY_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** POST /community/posts/:postId/comments */
export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment body is required.").max(COMMENT_MAX),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_MAX),
});

/** POST /community/posts/:postId/reactions */
export const reactionSchema = z.object({
  kind: z.enum(REACTION_KINDS).default("like"),
});

// --- Moderation payloads ----------------------------------------------------

const reasonSchema = z.string().trim().max(REASON_MAX).nullish().transform((v) =>
  v && v.length > 0 ? v : null,
);

export const postModerationSchema = z.object({
  action: z.enum(["pin", "unpin", "lock", "unlock", "remove", "restore", "crosspost"]),
  reason: reasonSchema,
  /** For crosspost: the id of the source post being crossposted. */
  crosspostOf: z.string().trim().min(1).optional(),
});

export const commentModerationSchema = z.object({
  action: z.enum(["sticky", "unsticky", "distinguish", "undistinguish", "remove"]),
  reason: reasonSchema,
});

export const sanctionSchema = z.object({
  targetUserId: z.string().trim().min(1, "targetUserId is required."),
  reason: reasonSchema,
  /** Optional sanction kind, e.g. 'mute' | 'ban'; free-form for audit. */
  kind: z.string().trim().max(60).optional(),
});

export const keywordFilterSchema = z.object({
  keyword: z.string().trim().min(1, "keyword is required.").max(KEYWORD_MAX),
  reason: reasonSchema,
});

export const contentModerationSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().trim().min(1, "targetId is required."),
  action: z.string().trim().min(1).max(60),
  reason: reasonSchema,
});

export type CreatePostBody = z.infer<typeof createPostSchema>;
export type UpdatePostBody = z.infer<typeof updatePostSchema>;
export type ListPostsQueryInput = z.infer<typeof listPostsQuerySchema>;
export type CreateCommentBody = z.infer<typeof createCommentSchema>;
export type ReactionBody = z.infer<typeof reactionSchema>;
