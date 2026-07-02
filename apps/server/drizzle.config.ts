import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the Aiga content catalog schema.
 *
 * Migrations are generated offline from `src/db/schema` and applied against the
 * Neon (PostgreSQL) instance provisioned by the shared infra task (BBR-1117).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/aiga",
  },
  strict: true,
  verbose: true,
});
