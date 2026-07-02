import { Router } from "express";

import { asyncHandler } from "../async.js";
import * as authController from "../controllers/auth.controller.js";

/**
 * Owned REST auth contract under `/api/v1/auth`. Registration/login/logout
 * delegate to better-auth (cookie-correct); `session` returns the enriched
 * membership + entitlement view.
 *
 * Note: the canonical better-auth handler is also mounted at `/api/auth/*`
 * (see `http/app.ts`) for ecosystem client compatibility.
 */
export function authRouter(): Router {
  const router = Router();

  router.post("/register", asyncHandler(authController.register));
  router.post("/login", asyncHandler(authController.login));
  router.post("/logout", asyncHandler(authController.logout));
  router.get("/session", asyncHandler(authController.session));

  return router;
}
