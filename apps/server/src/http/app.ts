import { toNodeHandler } from "better-auth/node";
import express, { type Express } from "express";

import { getAuth } from "../auth/better-auth.js";
import { loadEnv } from "../env.js";
import { cors } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { attachPrincipal } from "./middleware/session.js";
import {
  adminCategoriesRouter,
  adminContentRouter,
} from "./routes/admin-content.routes.js";
import { adminUsersRouter } from "./routes/admin-users.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoriesRouter, contentRouter } from "./routes/content.routes.js";

/**
 * Assemble the Express application for the auth/membership surface.
 *
 * Ordering notes:
 *  - CORS runs first so pre-flight and credentialed responses are correct.
 *  - The better-auth node handler is mounted at `/api/auth/*` BEFORE the JSON
 *    body parser (better-auth consumes the raw request body itself).
 *  - `attachPrincipal` resolves the session → principal for every downstream
 *    route so guards and controllers can rely on `req.principal`.
 *
 * Feature routers (content-catalog, community, reviews, doctor-verification) are
 * wired by the base router task (BBR-1117) using `entitlementForRole`; this app
 * owns the auth + admin-users surface delivered by BBR-1121.
 */
export function buildApp(): Express {
  const env = loadEnv();
  const app = express();

  app.disable("x-powered-by");
  app.use(cors(env.corsOrigins));

  // Canonical better-auth endpoints (raw body) — mount before express.json().
  app.all("/api/auth/*", toNodeHandler(getAuth()));

  app.use(express.json());
  app.use(attachPrincipal);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "auth-membership", status: "healthy" });
  });

  app.use("/api/v1/auth", authRouter());
  app.use("/api/v1/admin/users", adminUsersRouter());

  // Content Catalog (BBR-1145): public browse/search/detail + member CRUD +
  // admin management. Mounted here until the base-router task (BBR-1117)
  // centralizes feature-router wiring; additive and self-contained.
  app.use("/api/v1/content", contentRouter());
  app.use("/api/v1/categories", categoriesRouter());
  app.use("/api/v1/admin/content", adminContentRouter());
  app.use("/api/v1/admin/categories", adminCategoriesRouter());


  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
