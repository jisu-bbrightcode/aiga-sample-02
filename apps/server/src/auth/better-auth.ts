import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getDb } from "../db/client.js";
import {
  account,
  session,
  user,
  verification,
} from "../db/schema/auth.js";
import { profiles } from "../db/schema/profiles.js";
import { DEFAULT_PROFILE_TIER } from "../membership/tiers.js";
import { loadEnv } from "../env.js";

/**
 * better-auth instance providing email/password authentication and session
 * management, backed by the drizzle (PostgreSQL/Neon) adapter.
 *
 * Built lazily so importing auth-adjacent modules does not eagerly create a DB
 * pool — the pure membership/rbac domain stays import-safe for unit tests.
 *
 * The concrete instance type is derived from `createAuth` (not from
 * `ReturnType<typeof betterAuth>`) so the precise, option-specialized `Auth<…>`
 * type flows through `getAuth`/`AuthSession` instead of the widened generic.
 */
function createAuth() {
  const env = loadEnv();

  return betterAuth({
    appName: "Aiga",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh once per day
    },
    databaseHooks: {
      user: {
        create: {
          // Bootstrap a default-tier profile for every newly registered user so
          // membership/entitlement resolution always has a row to read.
          after: async (createdUser) => {
            await getDb()
              .insert(profiles)
              .values({ userId: createdUser.id, tier: DEFAULT_PROFILE_TIER })
              .onConflictDoNothing();
          },
        },
      },
    },
    trustedOrigins: [...env.corsOrigins],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let instance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  return (instance ??= createAuth());
}

/** Inferred better-auth session shape (`{ user, session }` or `null`). */
export type AuthSession = Awaited<
  ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>
>;
