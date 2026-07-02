import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";

import { getAuth } from "../../auth/better-auth.js";
import { GUEST_PRINCIPAL } from "../../rbac/entitlement.js";
import { buildPrincipal } from "../../services/principal.service.js";

/**
 * Resolve the request's security principal from the better-auth session and
 * attach it as `req.principal`. Always sets a principal (guest when no valid
 * session) so downstream handlers can rely on its presence.
 */
export async function attachPrincipal(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth();
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    req.principal = await buildPrincipal(result?.user?.id ?? null);
  } catch {
    // A failed session lookup must not 500 public routes — degrade to guest.
    req.principal = GUEST_PRINCIPAL;
  }
  next();
}
