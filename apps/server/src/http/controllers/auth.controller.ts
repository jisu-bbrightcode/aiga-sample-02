import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { z } from "zod";

import { getAuth } from "../../auth/better-auth.js";
import { resolvePolicy } from "../../membership/policy.js";
import { TIER_LABELS } from "../../membership/tiers.js";
import {
  effectivePermissions,
  GUEST_PRINCIPAL,
} from "../../rbac/entitlement.js";
import { sendWebResponse } from "../web-response.js";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/v1/auth/register — email sign-up (delegates to better-auth). */
export async function register(req: Request, res: Response): Promise<void> {
  const body = RegisterSchema.parse(req.body);
  const response = await getAuth().api.signUpEmail({
    body,
    headers: fromNodeHeaders(req.headers),
    asResponse: true,
  });
  await sendWebResponse(res, response);
}

/** POST /api/v1/auth/login — email sign-in. */
export async function login(req: Request, res: Response): Promise<void> {
  const body = LoginSchema.parse(req.body);
  const response = await getAuth().api.signInEmail({
    body,
    headers: fromNodeHeaders(req.headers),
    asResponse: true,
  });
  await sendWebResponse(res, response);
}

/** POST /api/v1/auth/logout — sign out the current session. */
export async function logout(req: Request, res: Response): Promise<void> {
  const response = await getAuth().api.signOut({
    headers: fromNodeHeaders(req.headers),
    asResponse: true,
  });
  await sendWebResponse(res, response);
}

/**
 * GET /api/v1/auth/session — enriched session: the better-auth user plus the
 * resolved membership tier, policy, and effective permissions. Returns a guest
 * envelope (200) when unauthenticated so clients have a uniform shape.
 */
export async function session(req: Request, res: Response): Promise<void> {
  const principal = req.principal ?? GUEST_PRINCIPAL;
  const authResult = await getAuth().api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  const policy = resolvePolicy(principal.tier);
  res.json({
    ok: true,
    data: {
      authenticated: principal.userId !== null,
      user: authResult?.user ?? null,
      tier: principal.tier,
      tierLabel: TIER_LABELS[principal.tier],
      roles: principal.roleKeys,
      permissions: [...effectivePermissions(principal)].sort(),
      policy,
    },
  });
}
