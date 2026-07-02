import { eq } from "drizzle-orm";

import { getDb, type Database } from "../db/client.js";
import { profiles } from "../db/schema/profiles.js";
import { resolvePolicy, type MembershipPolicy } from "../membership/policy.js";
import {
  DEFAULT_PROFILE_TIER,
  type MembershipTier,
  type ProfileTier,
} from "../membership/tiers.js";

/**
 * Membership policy-application service (등급 정책 적용 서비스).
 *
 * Applies the single-definition-plus-per-tier-override policy (see
 * `membership/policy.ts`) to concrete users, and owns tier transitions. Accepts
 * a drizzle handle so callers can run grants inside a transaction (e.g. the
 * doctor-verification approval flow); defaults to the shared connection.
 */
type WriteDb = Pick<Database, "insert">;

export interface ResolvedMembership {
  readonly tier: MembershipTier;
  readonly policy: MembershipPolicy;
}

/** Read a user's effective tier + resolved policy (defaults for missing rows). */
export async function resolveMembership(
  userId: string,
): Promise<ResolvedMembership> {
  const [row] = await getDb()
    .select({ tier: profiles.tier })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const tier: MembershipTier = row?.tier ?? DEFAULT_PROFILE_TIER;
  return { tier, policy: resolvePolicy(tier) };
}

/** Idempotently set a user's membership tier, keeping the expert flag coherent. */
export async function setTier(
  userId: string,
  tier: ProfileTier,
  db: WriteDb = getDb(),
  now: Date = new Date(),
): Promise<void> {
  const policy = resolvePolicy(tier);
  await db
    .insert(profiles)
    .values({
      userId,
      tier,
      isExpert: policy.showExpertBadge,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { tier, isExpert: policy.showExpertBadge, updatedAt: now },
    });
}

export interface DoctorVerifiedGrant {
  readonly userId: string;
  readonly specialty?: string | null;
  readonly licenseNumber?: string | null;
  readonly verifiedAt?: Date;
}

/**
 * Promote a user to 의사인증회원 (verified_doctor) and stamp the expert badge.
 * Idempotent per user. Provided as the canonical implementation of the
 * membership upgrade that the doctor-verification feature (BBR-1127) invokes on
 * approval; pass a tx handle to run it atomically with the approval write.
 */
export async function grantDoctorVerified(
  grant: DoctorVerifiedGrant,
  db: WriteDb = getDb(),
): Promise<void> {
  const now = grant.verifiedAt ?? new Date();
  await db
    .insert(profiles)
    .values({
      userId: grant.userId,
      tier: "verified_doctor",
      isExpert: true,
      expertBadge: "verified_doctor",
      specialty: grant.specialty ?? null,
      licenseNumber: grant.licenseNumber ?? null,
      licenseVerifiedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tier: "verified_doctor",
        isExpert: true,
        expertBadge: "verified_doctor",
        specialty: grant.specialty ?? null,
        licenseNumber: grant.licenseNumber ?? null,
        licenseVerifiedAt: now,
        updatedAt: now,
      },
    });
}
