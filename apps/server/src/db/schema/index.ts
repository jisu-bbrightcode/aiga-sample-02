/**
 * Aggregate schema barrel consumed by drizzle-kit (`drizzle.config.ts`) and the
 * drizzle client. Feature modules add their own schema files and re-export them
 * here so migrations see the full model in one place.
 */
export * from "./auth.js";
export * from "./profiles.js";
export * from "./rbac.js";

// Feature schemas (re-exported so drizzle-kit sees them in one place).
export * from "../../features/review-rating/schema.js";
export * from "../../features/community/schema.js";
