import { Router } from "express";

import { PERMISSIONS } from "../../rbac/permissions.js";
import { asyncHandler } from "../async.js";
import * as adminUsers from "../controllers/admin-users.controller.js";
import { requireAdmin, requirePermission } from "../middleware/entitlement.js";

/**
 * Admin user-management API under `/api/v1/admin/users`.
 * All routes require admin access; mutations require the update permission.
 */
export function adminUsersRouter(): Router {
  const router = Router();

  router.use(requireAdmin());

  router.get(
    "/",
    requirePermission(PERMISSIONS.adminUsersRead),
    asyncHandler(adminUsers.list),
  );

  router.get(
    "/:id",
    requirePermission(PERMISSIONS.adminUsersRead),
    asyncHandler(adminUsers.detail),
  );

  router.patch(
    "/:id/tier",
    requirePermission(PERMISSIONS.adminUsersUpdate),
    asyncHandler(adminUsers.changeTier),
  );

  return router;
}
