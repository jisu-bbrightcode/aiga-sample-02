/**
 * Express integration for the review & rating feature.
 *
 * Builds the service from the Drizzle adapters (review repository + membership
 * reader) and mounts the routes with the shared entitlement middleware. The
 * framework-agnostic controller does the parsing + domain error mapping; this
 * layer only translates its { status, body } result onto the Express response,
 * so behaviour stays consistent with the unit-tested controller.
 *
 * Wiring contract (BBR-1117 base router): call `createReviewRatingRouter()` and
 * mount it under the API prefix, after `attachPrincipal`.
 */
import { Router, type Request } from "express";

import { getDb, type Database } from "../../db/client.js";
import { asyncHandler } from "../../http/async.js";
import { requireTier } from "../../http/middleware/entitlement.js";
import { can, GUEST_PRINCIPAL, isAuthenticated } from "../../rbac/entitlement.js";
import { PERMISSIONS } from "../../rbac/permissions.js";
import {
  createReviewRatingController,
  type Actor,
  type HandlerRequest,
  type HandlerResponse,
} from "./controller.js";
import {
  DrizzleMembershipReader,
  DrizzleReviewRepository,
  type DrizzleDb,
} from "./drizzle-repository.js";
import { ReviewService } from "./service.js";

/** Derive the controller actor from the request principal (null for guests). */
const actorOf = (req: Request): Actor | null => {
  const principal = req.principal ?? GUEST_PRINCIPAL;
  if (!isAuthenticated(principal) || !principal.userId) return null;
  return {
    userId: principal.userId,
    role: can(principal, PERMISSIONS.adminAccess) ? "admin" : "member",
  };
};

const toHandlerRequest = (req: Request): HandlerRequest => ({
  actor: actorOf(req),
  params: req.params as Record<string, string | undefined>,
  query: req.query as Record<string, unknown>,
  body: req.body,
});

export interface ReviewRatingRouterDeps {
  /** Drizzle db handle; defaults to the shared pool. Injectable for tests. */
  readonly db?: Database;
}

export function createReviewRatingService(db: DrizzleDb): ReviewService {
  const repo = new DrizzleReviewRepository(db);
  const membership = new DrizzleMembershipReader(db);
  return new ReviewService({ repo, membership });
}

export function createReviewRatingRouter(deps: ReviewRatingRouterDeps = {}): Router {
  const db = (deps.db ?? getDb()) as unknown as DrizzleDb;
  const service = createReviewRatingService(db);
  const controller = createReviewRatingController(service);

  const send = (handler: (req: HandlerRequest) => Promise<HandlerResponse>) =>
    asyncHandler(async (req, res) => {
      const result = await handler(toHandlerRequest(req));
      res.status(result.status).json(result.body);
    });

  const router = Router();

  // --- Public reads (리뷰/평점 노출) — open to guests ---
  router.get("/profiles/:targetUserId/reviews", send(controller.list));
  router.get("/profiles/:targetUserId/reviews/summary", send(controller.summary));
  router.get("/reviews/:id", send(controller.getOne));

  // --- Write: authorship restricted to 의사인증회원 (verified doctors) ---
  router.post(
    "/profiles/:targetUserId/reviews",
    requireTier("verified_doctor"),
    send(controller.create),
  );

  // --- Edit / delete: any authenticated member; the service enforces
  //     author-ownership (delete also allows admins). ---
  router.patch("/reviews/:id", requireTier("member"), send(controller.update));
  router.delete("/reviews/:id", requireTier("member"), send(controller.remove));

  return router;
}
