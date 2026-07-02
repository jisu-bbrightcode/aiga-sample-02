/**
 * Framework-agnostic REST controller for the community feature. Each handler
 * takes a normalized request (with a resolved {@link Actor}) and returns a typed
 * `{ status, body }` result; the HTTP adapter (`http.ts`) maps it onto Express.
 *
 * Authorization is enforced in the services (participation / owner / admin) so
 * these handlers stay thin and the QA contract (BBR-1134) can drive them
 * directly without a live server. The guest actor (userId=null, tier='guest')
 * is passed through — write use cases reject it with 403, reads allow it.
 */
import { ZodError } from "zod";

import { HttpError } from "../../http/errors.js";
import { CommunityError } from "./errors.js";
import { viewBucketKey } from "./guards.js";
import type { CommunityServices } from "./service.js";
import type { Actor } from "./types.js";
import {
  commentModerationSchema,
  contentModerationSchema,
  createCommentSchema,
  createPostSchema,
  keywordFilterSchema,
  listPostsQuerySchema,
  postModerationSchema,
  reactionSchema,
  sanctionSchema,
  updateCommentSchema,
  updatePostSchema,
} from "./validation.js";

export interface HandlerRequest {
  readonly actor: Actor;
  readonly params: Record<string, string | undefined>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
}

export interface HandlerResponse {
  readonly status: number;
  readonly body: unknown;
}

const ok = (body: unknown, status = 200): HandlerResponse => ({ status, body });

const errorBody = (code: string, message: string, details?: unknown) => ({
  error: { code, message, ...(details ? { details } : {}) },
});

/** Maps thrown errors to safe REST responses (no internal leakage). */
export const toErrorResponse = (err: unknown): HandlerResponse => {
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: errorBody("VALIDATION_ERROR", "Invalid request.", err.flatten()),
    };
  }
  if (err instanceof CommunityError) {
    return { status: err.status, body: errorBody(err.code, err.message) };
  }
  if (err instanceof HttpError) {
    return { status: err.status, body: errorBody(err.code.toUpperCase(), err.message) };
  }
  return { status: 500, body: errorBody("INTERNAL_ERROR", "Unexpected error.") };
};

const guard =
  (fn: (req: HandlerRequest) => Promise<HandlerResponse>) =>
  async (req: HandlerRequest): Promise<HandlerResponse> => {
    try {
      return await fn(req);
    } catch (err) {
      return toErrorResponse(err);
    }
  };

const requireParam = (req: HandlerRequest, name: string): string => {
  const value = req.params[name];
  if (!value) throw HttpError.badRequest(`Missing path parameter: ${name}`);
  return value;
};

/** Actor's user id, required for authored writes (guests are rejected upstream). */
const requireUserId = (actor: Actor): string => {
  if (!actor.userId) throw HttpError.unauthorized();
  return actor.userId;
};

export const createCommunityController = (services: CommunityServices) => ({
  // --- Posts ---------------------------------------------------------------

  /** POST /community/posts */
  createPost: guard(async (req) => {
    const parsed = createPostSchema.parse(req.body);
    const view = await services.posts.create(req.actor, {
      authorId: req.actor.userId ?? "",
      title: parsed.title,
      body: parsed.body,
      category: parsed.category,
    });
    return ok(view, 201);
  }),

  /** GET /community/posts */
  listPosts: guard(async (req) => {
    const q = listPostsQuerySchema.parse(req.query);
    const page = await services.posts.list(req.actor, q);
    return ok(page);
  }),

  /** GET /community/posts/:id */
  getPost: guard(async (req) => {
    const id = requireParam(req, "id");
    const view = await services.posts.getPost(req.actor, id, viewBucketKey(req.actor));
    return ok(view);
  }),

  /** PATCH /community/posts/:id */
  updatePost: guard(async (req) => {
    const id = requireParam(req, "id");
    const parsed = updatePostSchema.parse(req.body);
    const view = await services.posts.update(req.actor, id, {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.body !== undefined ? { body: parsed.body } : {}),
      ...(parsed.category !== undefined ? { category: parsed.category } : {}),
    });
    return ok(view);
  }),

  /** DELETE /community/posts/:id */
  deletePost: guard(async (req) => {
    const id = requireParam(req, "id");
    const post = await services.posts.remove(req.actor, id);
    return ok({ id: post.id, status: post.status, deletedAt: post.deletedAt });
  }),

  /** POST /community/posts/:id/moderation (admin) */
  moderatePost: guard(async (req) => {
    const id = requireParam(req, "id");
    const parsed = postModerationSchema.parse(req.body);
    const result = await services.posts.moderate(req.actor, id, {
      action: parsed.action,
      reason: parsed.reason,
      ...(parsed.crosspostOf !== undefined ? { crosspostOf: parsed.crosspostOf } : {}),
    });
    return ok(result);
  }),

  // --- Comments ------------------------------------------------------------

  /** POST /community/posts/:postId/comments */
  createComment: guard(async (req) => {
    const postId = requireParam(req, "postId");
    const parsed = createCommentSchema.parse(req.body);
    const view = await services.comments.create(req.actor, {
      postId,
      authorId: req.actor.userId ?? "",
      body: parsed.body,
    });
    return ok(view, 201);
  }),

  /** GET /community/posts/:postId/comments */
  listComments: guard(async (req) => {
    const postId = requireParam(req, "postId");
    const items = await services.comments.listByPost(postId);
    return ok({ items });
  }),

  /** PATCH /community/comments/:id */
  updateComment: guard(async (req) => {
    const id = requireParam(req, "id");
    const parsed = updateCommentSchema.parse(req.body);
    const view = await services.comments.update(req.actor, id, parsed.body);
    return ok(view);
  }),

  /** DELETE /community/comments/:id */
  deleteComment: guard(async (req) => {
    const id = requireParam(req, "id");
    const comment = await services.comments.remove(req.actor, id);
    return ok({ id: comment.id, status: comment.status, deletedAt: comment.deletedAt });
  }),

  /** POST /community/comments/:id/moderation (admin) */
  moderateComment: guard(async (req) => {
    const id = requireParam(req, "id");
    const parsed = commentModerationSchema.parse(req.body);
    const result = await services.comments.moderate(
      req.actor,
      id,
      parsed.action,
      parsed.reason,
    );
    return ok(result);
  }),

  // --- Reactions -----------------------------------------------------------

  /** POST /community/posts/:postId/reactions */
  react: guard(async (req) => {
    const postId = requireParam(req, "postId");
    const parsed = reactionSchema.parse(req.body ?? {});
    const result = await services.reactions.cast(req.actor, postId, parsed.kind);
    return ok(result, result.changed ? 201 : 200);
  }),

  /** DELETE /community/posts/:postId/reactions */
  unreact: guard(async (req) => {
    const postId = requireParam(req, "postId");
    const result = await services.reactions.remove(req.actor, postId);
    return ok(result);
  }),

  // --- Admin moderation surface --------------------------------------------

  /** POST /community/moderation/sanctions (admin) */
  sanction: guard(async (req) => {
    requireUserId(req.actor);
    const parsed = sanctionSchema.parse(req.body);
    const audit = await services.moderation.sanction(req.actor, {
      targetUserId: parsed.targetUserId,
      reason: parsed.reason,
      ...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
    });
    return ok({ audit });
  }),

  /** POST /community/moderation/keyword-filters (admin) */
  keywordFilter: guard(async (req) => {
    requireUserId(req.actor);
    const parsed = keywordFilterSchema.parse(req.body);
    const audit = await services.moderation.addKeywordFilter(req.actor, {
      keyword: parsed.keyword,
      reason: parsed.reason,
    });
    return ok({ audit });
  }),

  /** POST /community/moderation/content-actions (admin) */
  contentModeration: guard(async (req) => {
    requireUserId(req.actor);
    const parsed = contentModerationSchema.parse(req.body);
    const audit = await services.moderation.moderateContent(req.actor, {
      targetType: parsed.targetType,
      targetId: parsed.targetId,
      action: parsed.action,
      reason: parsed.reason,
    });
    return ok({ audit });
  }),
});

export type CommunityController = ReturnType<typeof createCommunityController>;
