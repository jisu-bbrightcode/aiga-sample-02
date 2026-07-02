import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { MembershipTier } from "../../membership/tiers.js";
import { tierAtLeast } from "../../membership/tiers.js";
import {
  can,
  canAll,
  GUEST_PRINCIPAL,
  isAuthenticated,
  type Principal,
} from "../../rbac/entitlement.js";
import type { PermissionKey } from "../../rbac/permissions.js";
import { HttpError } from "../errors.js";

function principalOf(req: Request): Principal {
  return req.principal ?? GUEST_PRINCIPAL;
}

/** Require an authenticated (non-guest) principal. */
export function requireAuth(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!isAuthenticated(principalOf(req))) {
      return next(HttpError.unauthorized());
    }
    next();
  };
}

/** Require every listed permission (via tier matrix or staff role). */
export function requirePermission(
  ...permissions: readonly PermissionKey[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = principalOf(req);
    if (!isAuthenticated(principal)) return next(HttpError.unauthorized());
    if (!canAll(principal, permissions)) {
      return next(
        HttpError.forbidden(
          `Missing required permission(s): ${permissions.join(", ")}`,
        ),
      );
    }
    next();
  };
}

/** Require the principal's membership tier to be at least `minimum`. */
export function requireTier(minimum: MembershipTier): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = principalOf(req);
    if (minimum !== "guest" && !isAuthenticated(principal)) {
      return next(HttpError.unauthorized());
    }
    if (!tierAtLeast(principal.tier, minimum)) {
      return next(
        HttpError.forbidden(`Requires membership tier '${minimum}' or higher`),
      );
    }
    next();
  };
}

/** Convenience guard for any admin surface. */
export function requireAdmin(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = principalOf(req);
    if (!isAuthenticated(principal)) return next(HttpError.unauthorized());
    if (!can(principal, "admin.access")) {
      return next(HttpError.forbidden("Admin access required"));
    }
    next();
  };
}

/**
 * Coarse role required by a feature route (`RouteDef.requiredRole`).
 *
 * This is the integration contract for the base router (BBR-1117): feature
 * modules declare `requiredRole: 'member' | 'admin'` on each route, and the
 * router applies `entitlementForRole(requiredRole)` as middleware. Membership
 * tiers and fine-grained permissions remain available via `requireTier` /
 * `requirePermission` for feature-internal checks.
 */
export type EntitlementRole = "member" | "admin";

export function entitlementForRole(role: EntitlementRole): RequestHandler {
  return role === "admin" ? requireAdmin() : requireTier("member");
}
