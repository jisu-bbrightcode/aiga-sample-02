import { Router } from "express";

import { PERMISSIONS } from "../../rbac/permissions.js";
import { asyncHandler } from "../async.js";
import * as adminContent from "../controllers/admin-content.controller.js";
import { requireAdmin, requirePermission } from "../middleware/entitlement.js";

/**
 * Admin content-management API under `/api/v1/admin/content`. All routes require
 * admin access plus the `admin.content.moderate` permission. Covers the canonical
 * moderation model: publish/hide (status), restore (un-delete) and delete.
 */
export function adminContentRouter(): Router {
  const router = Router();

  router.use(requireAdmin());
  router.use(requirePermission(PERMISSIONS.adminContentModerate));

  router.get("/", asyncHandler(adminContent.list));
  router.get("/:id", asyncHandler(adminContent.detail));
  router.patch("/:id", asyncHandler(adminContent.update));
  router.post("/:id/status", asyncHandler(adminContent.setStatus));
  router.post("/:id/restore", asyncHandler(adminContent.restore));
  router.delete("/:id", asyncHandler(adminContent.remove));

  return router;
}
