/**
 * Framework-agnostic REST controller. Each handler takes a normalized request
 * (authenticated + entitlement-checked by the base router from BBR-1117/BBR-1121)
 * and returns a typed { status, body } result. A thin adapter in the base wires
 * these to the concrete HTTP framework (Express).
 *
 * Read routes (`requiredRole: 'public'`) may run without an actor; write routes
 * always have one. Handlers re-check ownership where relevant.
 */
import { ZodError } from "zod";

import { HttpError } from "../../http/errors.js";
import { ReviewError } from "./errors.js";
import type { ReviewService } from "./service.js";
import {
  createReviewSchema,
  listReviewsQuerySchema,
  updateReviewSchema,
} from "./validation.js";

export interface Actor {
  readonly userId: string;
  readonly role: "member" | "admin";
}

export interface HandlerRequest {
  readonly actor: Actor | null;
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
  if (err instanceof ReviewError) {
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

const requireActor = (req: HandlerRequest): Actor => {
  if (!req.actor) throw HttpError.unauthorized();
  return req.actor;
};

const requireParam = (req: HandlerRequest, name: string): string => {
  const value = req.params[name];
  if (!value) throw HttpError.badRequest(`Missing path parameter: ${name}`);
  return value;
};

export const createReviewRatingController = (service: ReviewService) => ({
  /** POST /profiles/:targetUserId/reviews  (verified-doctor member) */
  create: guard(async (req) => {
    const actor = requireActor(req);
    const targetUserId = requireParam(req, "targetUserId");
    const parsed = createReviewSchema.parse(req.body);
    const view = await service.create({
      authorId: actor.userId,
      targetUserId,
      rating: parsed.rating,
      title: parsed.title,
      body: parsed.body,
    });
    return ok(view, 201);
  }),

  /** PATCH /reviews/:id  (author only) */
  update: guard(async (req) => {
    const actor = requireActor(req);
    const reviewId = requireParam(req, "id");
    const parsed = updateReviewSchema.parse(req.body);
    const view = await service.update({
      reviewId,
      authorId: actor.userId,
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.body !== undefined ? { body: parsed.body } : {}),
    });
    return ok(view);
  }),

  /** DELETE /reviews/:id  (author or admin) */
  remove: guard(async (req) => {
    const actor = requireActor(req);
    const reviewId = requireParam(req, "id");
    const review = await service.delete({
      reviewId,
      actorId: actor.userId,
      isAdmin: actor.role === "admin",
    });
    return ok({ id: review.id, status: review.status, deletedAt: review.deletedAt });
  }),

  /** GET /reviews/:id  (public) */
  getOne: guard(async (req) => {
    const reviewId = requireParam(req, "id");
    const view = await service.getReview(reviewId);
    return ok(view);
  }),

  /** GET /profiles/:targetUserId/reviews  (public) */
  list: guard(async (req) => {
    const targetUserId = requireParam(req, "targetUserId");
    const q = listReviewsQuerySchema.parse(req.query);
    const page = await service.listByTarget({ targetUserId, ...q });
    return ok(page);
  }),

  /** GET /profiles/:targetUserId/reviews/summary  (public) */
  summary: guard(async (req) => {
    const targetUserId = requireParam(req, "targetUserId");
    const summary = await service.getRatingSummary(targetUserId);
    return ok(summary);
  }),
});

export type ReviewRatingController = ReturnType<typeof createReviewRatingController>;
