import type { Request, Response } from "express";

import { getCategoryService } from "../../features/content-catalog/factory.js";
import { guardContent } from "./content-error.js";

/** GET /api/v1/categories — public category list. */
export const list = guardContent(async (_req: Request, res: Response) => {
  res.json({ ok: true, data: await getCategoryService().list() });
});
