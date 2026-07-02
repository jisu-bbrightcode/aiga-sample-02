/**
 * Express integration for the community feature.
 *
 * Builds the services from the Drizzle adapters and registers the declarative
 * route table (`routes.ts`) with the shared entitlement middleware. The
 * framework-agnostic controller does the parsing + domain error mapping; this
 * layer only resolves the {@link Actor} from `req.principal` and translates the
 * controller's `{ status, body }` result onto the Express response.
 *
 * Wiring contract (BBR-1117 base router): call `createCommunityRouter()` and
 * mount it under the API prefix, after `attachPrincipal`. Do not edit `app.ts`.
 */
import { randomUUID } from "node:crypto";

import { Router, type Request, type RequestHandler } from "express";

import { getDb, type Database } from "../../db/client.js";
import { asyncHandler } from "../../http/async.js";
import { requireAdmin, requireTier } from "../../http/middleware/entitlement.js";
import { can, GUEST_PRINCIPAL, isAuthenticated } from "../../rbac/entitlement.js";
import { PERMISSIONS } from "../../rbac/permissions.js";
import {
  createCommunityController,
  type CommunityController,
  type HandlerRequest,
  type HandlerResponse,
} from "./controller.js";
import {
  DrizzleCommentRepository,
  DrizzleModerationRepository,
  DrizzlePostRepository,
  DrizzlePostViewRepository,
  DrizzleReactionRepository,
  DrizzleMembershipReader,
  type DrizzleDb,
} from "./drizzle-repository.js";
import type { Clock, IdGenerator } from "./ports.js";
import { communityRoutes, type RequiredRole } from "./routes.js";
import { createCommunityServices, type CommunityServices } from "./service.js";
import type { Actor } from "./types.js";

const systemClock: Clock = { now: () => new Date() };
const uuidGenerator: IdGenerator = { next: () => randomUUID() };

/** First client IP from x-forwarded-for (proxy chain), falling back to req.ip. */
const clientIp = (req: Request): string | null => {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = raw?.split(",")[0]?.trim();
  return first || req.ip || null;
};

/** Resolve the controller actor from the request principal (guest-safe). */
const actorOf = (req: Request): Actor => {
  const principal = req.principal ?? GUEST_PRINCIPAL;
  return {
    userId: isAuthenticated(principal) ? principal.userId : null,
    tier: principal.tier,
    isAdmin: can(principal, PERMISSIONS.adminAccess),
    ip: clientIp(req),
  };
};

const toHandlerRequest = (req: Request): HandlerRequest => ({
  actor: actorOf(req),
  params: req.params as Record<string, string | undefined>,
  query: req.query as Record<string, unknown>,
  body: req.body,
});

const roleMiddleware = (role: RequiredRole): RequestHandler[] => {
  if (role === "admin") return [requireAdmin()];
  if (role === "member") return [requireTier("member")];
  return [];
};

export interface CommunityRouterDeps {
  /** Drizzle db handle; defaults to the shared pool. Injectable for tests. */
  readonly db?: Database;
}

export function createCommunityServiceFromDb(db: DrizzleDb): CommunityServices {
  return createCommunityServices({
    posts: new DrizzlePostRepository(db),
    comments: new DrizzleCommentRepository(db),
    reactions: new DrizzleReactionRepository(db),
    moderation: new DrizzleModerationRepository(db),
    views: new DrizzlePostViewRepository(db),
    membership: new DrizzleMembershipReader(db),
    clock: systemClock,
    ids: uuidGenerator,
  });
}

export function createCommunityRouter(deps: CommunityRouterDeps = {}): Router {
  const db = (deps.db ?? getDb()) as unknown as DrizzleDb;
  const services = createCommunityServiceFromDb(db);
  const controller = createCommunityController(services);

  const send =
    (handlerName: keyof CommunityController): RequestHandler =>
    (req, res, next) =>
      asyncHandler(async (r) => {
        const result: HandlerResponse = await controller[handlerName](
          toHandlerRequest(r),
        );
        res.status(result.status).json(result.body);
      })(req, res, next);

  const router = Router();
  for (const route of communityRoutes) {
    router[methodFn(route.method)](
      route.path,
      ...roleMiddleware(route.requiredRole),
      send(route.handler),
    );
  }
  return router;
}

const methodFn = (
  m: "GET" | "POST" | "PATCH" | "DELETE",
): "get" | "post" | "patch" | "delete" =>
  m === "GET" ? "get" : m === "POST" ? "post" : m === "PATCH" ? "patch" : "delete";
