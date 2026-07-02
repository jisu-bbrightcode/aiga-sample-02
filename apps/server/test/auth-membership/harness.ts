import type { NextFunction, Request, RequestHandler, Response } from "express";

import { HttpError } from "../../src/http/errors.js";
import { type Principal } from "../../src/rbac/entitlement.js";
import type { PermissionKey } from "../../src/rbac/permissions.js";
import type { MembershipTier } from "../../src/membership/tiers.js";

/**
 * Test harness for the entitlement/authorization pipeline (BBR-1122 BE QA).
 *
 * Drives the *real* Express middleware guards (`http/middleware/entitlement`)
 * with a synthesized `req.principal`, exactly the way `attachPrincipal` would
 * populate it from a better-auth session. This lets the QA suite assert the
 * observable authorization behavior (pass / 401 / 403) of composed route guard
 * stacks without a live database or better-auth runtime.
 */

/** Build a principal, defaulting to a plain authenticated member. */
export function makePrincipal(over: Partial<Principal> = {}): Principal {
  return Object.freeze({
    userId: "user-1",
    tier: "member",
    roleKeys: Object.freeze([]),
    rolePermissions: new Set<PermissionKey>(),
    ...over,
  });
}

/** Build a staff principal carrying the given role-granted permissions. */
export function makeAdmin(
  rolePermissions: readonly PermissionKey[],
  tier: MembershipTier = "member",
): Principal {
  return makePrincipal({
    userId: "admin-1",
    tier,
    roleKeys: ["admin"],
    rolePermissions: new Set<PermissionKey>(rolePermissions),
  });
}

export interface GuardOutcome {
  /** True when every guard called `next()` with no error (request allowed). */
  readonly passed: boolean;
  /** HTTP status of the first rejecting guard, or null when allowed. */
  readonly status: number | null;
  /** The rejecting HttpError, or null when allowed. */
  readonly error: HttpError | null;
}

/**
 * Run a guard chain against a principal, mirroring Express' sequential
 * middleware execution. `principal = null` simulates a request that never had a
 * session attached (the guards then fall back to `GUEST_PRINCIPAL` internally).
 *
 * The entitlement guards are synchronous and call `next` exactly once, so the
 * runner is synchronous and asserts that invariant.
 */
export function runGuards(
  guards: readonly RequestHandler[],
  principal: Principal | null,
): GuardOutcome {
  const req = {
    principal: principal ?? undefined,
    headers: {},
    params: {},
    query: {},
    body: {},
  } as unknown as Request;
  const res = {} as Response;

  for (const guard of guards) {
    let called = false;
    let nextArg: unknown;
    const next: NextFunction = ((arg?: unknown) => {
      called = true;
      nextArg = arg;
    }) as NextFunction;

    guard(req, res, next);

    if (!called) {
      throw new Error("guard did not call next() synchronously");
    }
    if (nextArg !== undefined) {
      const error =
        nextArg instanceof HttpError
          ? nextArg
          : new HttpError(500, "unexpected", String(nextArg));
      return { passed: false, status: error.status, error };
    }
  }

  return { passed: true, status: null, error: null };
}
