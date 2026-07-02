import type { Request, Response } from "express";
import { z } from "zod";

import {
  getCategoryService,
  getContentService,
} from "../../features/content-catalog/factory.js";
import {
  adminListQuerySchema,
  createCategorySchema,
  setStatusSchema,
  updateCategorySchema,
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

/** POST /api/v1/admin/content/:id/status — moderation status change. */
export const setStatus = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const { status } = setStatusSchema.parse(req.body);
  res.json({ ok: true, data: await getContentService().adminSetStatus(id, status) });
});

/** DELETE /api/v1/admin/content/:id — soft delete (or ?hard=true purge). */
export const remove = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const hard = hardQuerySchema.parse(req.query.hard);
  await getContentService().adminRemove(id, { hard });
  res.json({ ok: true, data: { id, deleted: true, hard } });
});

/** POST /api/v1/admin/categories — create a category. */
export const createCategory = guardContent(async (req: Request, res: Response) => {
  const body = createCategorySchema.parse(req.body);
  res.status(201).json({ ok: true, data: await getCategoryService().create(body) });
});

/** PATCH /api/v1/admin/categories/:id — update a category. */
export const updateCategory = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  const body = updateCategorySchema.parse(req.body);
  res.json({ ok: true, data: await getCategoryService().update(id, body) });
});

/** DELETE /api/v1/admin/categories/:id — delete a category. */
export const removeCategory = guardContent(async (req: Request, res: Response) => {
  const id = idParamSchema.parse(req.params.id);
  await getCategoryService().remove(id);
  res.json({ ok: true, data: { id, deleted: true } });
});
