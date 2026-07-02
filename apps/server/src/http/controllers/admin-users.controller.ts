import type { Request, Response } from "express";
import { z } from "zod";

import { PROFILE_TIERS } from "../../membership/tiers.js";
import {
  changeUserTier,
  getUserDetail,
  listUsers,
} from "../../services/users.service.js";
import { HttpError } from "../errors.js";

// Exported so the BE-QA suite (BBR-1122) can pin the search/tier-change input
// contract directly against the schemas the routes actually enforce.
export const ListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  tier: z.enum(PROFILE_TIERS).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const ChangeTierSchema = z.object({
  tier: z.enum(PROFILE_TIERS),
});

/** GET /api/v1/admin/users — list/search members with tier filter + paging. */
export async function list(req: Request, res: Response): Promise<void> {
  const query = ListQuerySchema.parse(req.query);
  const result = await listUsers(query);
  res.json({
    ok: true,
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  });
}

/** GET /api/v1/admin/users/:id — member detail incl. profile + roles. */
export async function detail(req: Request, res: Response): Promise<void> {
  const userId = z.string().min(1).parse(req.params.id);
  const user = await getUserDetail(userId);
  if (!user) throw HttpError.notFound("User not found");
  res.json({ ok: true, data: user });
}

/** PATCH /api/v1/admin/users/:id/tier — change a member's grade (등급변경). */
export async function changeTier(req: Request, res: Response): Promise<void> {
  const userId = z.string().min(1).parse(req.params.id);
  const { tier } = ChangeTierSchema.parse(req.body);

  const actorId = req.principal?.userId;
  if (!actorId) throw HttpError.unauthorized();

  const updated = await changeUserTier(userId, tier, actorId);
  if (!updated) throw HttpError.notFound("User not found");
  res.json({ ok: true, data: updated });
}
