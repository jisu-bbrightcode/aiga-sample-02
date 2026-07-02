import { z } from "zod";

/**
 * Environment contract for the Aiga backend server.
 *
 * Validated once at process boundary (fail-fast). See `.env.example` at the
 * repo root for the full key mapping owned by the shared infra task (BBR-1117).
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8787),

  // Neon (PostgreSQL). Pooled URL for runtime, direct URL for migrations.
  DATABASE_URL: z.string().min(1).default("postgres://localhost:5432/aiga"),
  DIRECT_DATABASE_URL: z.string().optional(),

  // better-auth
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET must be at least 16 characters")
    .default("dev-insecure-secret-change-me-please"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:8787"),

  // Comma-separated allowed browser origins (public app + admin app).
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),
});

export type Env = Readonly<z.infer<typeof EnvSchema>> & {
  readonly corsOrigins: readonly string[];
  readonly isProduction: boolean;
};

let cached: Env | null = null;

/**
 * Parse and cache the process environment. Immutable: repeated calls return the
 * same frozen object rather than re-reading `process.env`.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const corsOrigins = parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  cached = Object.freeze({
    ...parsed.data,
    corsOrigins: Object.freeze(corsOrigins),
    isProduction: parsed.data.NODE_ENV === "production",
  });

  return cached;
}
