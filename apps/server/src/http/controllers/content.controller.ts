import type { Request, Response } from "express";
import { z } from "zod";

import { getContentService } from "../../features/content-catalog/factory.js";
import {
  createContentSchema,
  listQuerySchema,
  searchQuerySchema,
  updateContentSchema,
} from "../../features/content-catalog/validation.js";
import type {
  ContentActor,
  ContentViewer,
} from "../../features/content-catalog/service.js";
import { GUEST_PRINCIPAL, type Principal } from "../../rbac/entitlement.js";
import { can } from "../../rbac/entitlement.js";
import { PERMISSIONS } from "../../rbac/permissions.js";
import { guardContent } from "./content-error.js";
import { HttpError } from "../errors.js";

const idParamSchema = z.string().trim().min(1);

function principalOf(req: Request): Principal {
  return req.principal ?? GUEST_PRINCIPAL;
}

function viewerOf(req: Request): ContentViewer {
  const principal = principalOf(req);
  return { userId: principal.userId, isAdmin: can(principal, PERMISSIONS.adminContentModerate) };
}

/** Build the mutating actor; requires an authenticated principal. */
function actorOf(req: Request): ContentActor {
  const principal = principalOf(req);
  if (!principal.userId) throw HttpError.unauthorized();
  return { userId: principal.userId, isAdmin: can(principal, PERMISSIONS.adminContentModerate) };
}

const pageEnvelope = (result: {
  items: readonly unknown[];
  page: number;
  pageSize: number;
  total: number;
}) => ({
  ok: true,
  data: result.items,
  meta: { page: result.page, pageSize: result.pageSize, total: result.total },
});

/** GET /api/v1/content — list published content. */
export const list = guardContent(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);
  res.json(pageEnvelope(await getContentService().listPublished(query)));
});

/** GET /api/v1/content/search — content search over published items. */
export const search = guardContent(async (req: Request, res: Response) => {
  const query = searchQuerySchema.parse(req.query);
  res.json(pageEnvelope(await getContentService().search(query)));
});

/** GET /api/v1/content/mine — my content across all statuses (member). */
export const mine = guardContent(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const query = listQuerySchema.parse(req.query);
  res.json(pageEnvelope(await getContentService().listOwned(actor.userId, query)));
});

/** GET /api/v1/content/:id — detail by id. */
export const detail = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const content = await getContentService().getForViewer(id, viewerOf(req));
  res.json({ ok: true, data: content });
});

/** POST /api/v1/content — create a draft (member; notice requires admin). */
export const create = guardContent(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const body = createContentSchema.parse(req.body);
  const content = await getContentService().create({ ...body, authorId: actor.userId }, actor);
  res.status(201).json({ ok: true, data: content });
});

/** PATCH /api/v1/content/:id — update own content (member). */
export const update = guardContent(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const id = idParamSchema.parse(req.params.id);
  const body = updateContentSchema.parse(req.body);
  const content = await getContentService().update(id, actor, body);
  res.json({ ok: true, data: content });
});

/** DELETE /api/v1/content/:id — soft-delete own content (member). */
export const remove = guardContent(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const id = idParamSchema.parse(req.params.id);
  await getContentService().remove(id, actor);
  res.json({ ok: true, data: { id, deleted: true } });
});
