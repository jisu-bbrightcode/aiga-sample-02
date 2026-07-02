import { Router } from "express";

import { PERMISSIONS } from "../../rbac/permissions.js";
import { asyncHandler } from "../async.js";
import * as content from "../controllers/content.controller.js";
import * as categories from "../controllers/categories.controller.js";
import { requireAuth, requirePermission } from "../middleware/entitlement.js";

/**
 * Public + member Content Catalog API under `/api/v1/content`.
 *
 * Reads are open to guests (the tier matrix grants `content.read` to guest);
 * authoring requires the corresponding membership permission. Static segments
 * (`/search`, `/mine`) are registered before the `/:id` param route so they are
 * not shadowed by it.
 */
export function contentRouter(): Router {
  const router = Router();

  // Public reads (guest-allowed).
  router.get("/", asyncHandler(content.list));
  router.get("/search", asyncHandler(content.search));

  // Member: my own content (any status).
  router.get("/mine", requireAuth(), asyncHandler(content.mine));

  // Public detail by id or slug.
  router.get("/:id", asyncHandler(content.detail));

  // Authoring (member).
  router.post("/", requirePermission(PERMISSIONS.contentCreate), asyncHandler(content.create));
  router.patch(
    "/:id",
    requirePermission(PERMISSIONS.contentUpdateOwn),
    asyncHandler(content.update),
  );
  router.post(
    "/:id/submit",
    requirePermission(PERMISSIONS.contentUpdateOwn),
    asyncHandler(content.submit),
  );
  router.delete(
    "/:id",
    requirePermission(PERMISSIONS.contentDeleteOwn),
    asyncHandler(content.remove),
  );

  return router;
}

/** Public category list under `/api/v1/categories`. */
export function categoriesRouter(): Router {
  const router = Router();
  router.get("/", asyncHandler(categories.list));
  return router;
}
