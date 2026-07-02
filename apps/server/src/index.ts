import { closeDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { buildApp } from "./http/app.js";

/**
 * Server entrypoint.
 *
 * Boots the auth/membership Express app (BBR-1121). The shared base-router task
 * (BBR-1117) extends this to additionally mount the feature routers
 * (content-catalog, community, reviews, doctor-verification) via
 * `entitlementForRole`. Kept intentionally small so that wiring can grow here
 * without reshaping the module boundaries.
 */
function main(): void {
  const env = loadEnv();
  const app = buildApp();

  const server = app.listen(env.PORT, () => {
    console.info(`[server] listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string): void => {
    console.info(`[server] ${signal} received, shutting down`);
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
