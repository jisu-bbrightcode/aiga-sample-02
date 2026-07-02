import type { Request, Response } from "express";
import { z } from "zod";

import { getContentService } from "../../features/content-catalog/factory.js";
import {
  adminListQuerySchema,
  setStatusSchema,
  updateContentSchema,
} from "../../features/content-catalog/validation.js";
import { guardContent } from "./content-error.js";

const idParamSchema = z.string().trim().min(1);
const hardQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((v) => v === true || v === "true");

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

/** GET /api/v1/admin/content — list all content, any status. */
export const list = guardContent(async (req: Request, res: Response) => {
  const query = adminListQuerySchema.parse(req.query);
  res.json(pageEnvelope(await getContentService().adminList(query)));
});

/** GET /api/v1/admin/content/:id — fetch any content item. */
export const detail = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  res.json({ ok: true, data: await getContentService().adminGetById(id) });
});

/** PATCH /api/v1/admin/content/:id — edit any content item. */
export const update = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const body = updateContentSchema.parse(req.body);
  res.json({ ok: true, data: await getContentService().adminUpdate(id, body) });
});

/** POST /api/v1/admin/content/:id/status — publish / hide / unpublish. */
export const setStatus = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const { status } = setStatusSchema.parse(req.body);
  res.json({ ok: true, data: await getContentService().adminSetStatus(id, status) });
});

/** POST /api/v1/admin/content/:id/restore — clear soft delete. */
export const restore = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  res.json({ ok: true, data: await getContentService().adminRestore(id) });
});

/** DELETE /api/v1/admin/content/:id — soft delete (or ?hard=true purge). */
export const remove = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const hard = hardQuerySchema.parse(req.query.hard);
  await getContentService().adminRemove(id, { hard });
  res.json({ ok: true, data: { id, deleted: true, hard } });
});
