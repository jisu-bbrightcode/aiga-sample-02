/**
 * Canonical definition of the 3-tier membership model for Aiga.
 *
 * This module is the single source of truth for tier identifiers; both the
 * database schema (`db/schema/profiles.ts`) and the permission/policy layers
 * derive their values from here so the enum can never drift.
 *
 * Tiers (등급):
 *  - `guest`           비회원        — unauthenticated / no membership record
 *  - `member`          일반회원       — general authenticated member
 *  - `verified_doctor` 의사인증회원   — doctor-license-verified professional member
 */
export const MEMBERSHIP_TIERS = ["guest", "member", "verified_doctor"] as const;

export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

/**
 * Tiers that a persisted profile may hold. `guest` is the implicit tier for
 * requests without a session and is therefore never stored on a profile row.
 */
export const PROFILE_TIERS = ["member", "verified_doctor"] as const;

export type ProfileTier = (typeof PROFILE_TIERS)[number];

/** Default tier assigned to a brand-new registered member. */
export const DEFAULT_PROFILE_TIER: ProfileTier = "member";

/** Ordinal ranking used for "at least this tier" comparisons. Higher = more privileged. */
const TIER_RANK: Readonly<Record<MembershipTier, number>> = Object.freeze({
  guest: 0,
  member: 1,
  verified_doctor: 2,
});

/** Human-readable Korean labels for UI/admin surfaces. */
export const TIER_LABELS: Readonly<Record<MembershipTier, string>> = Object.freeze({
  guest: "비회원",
  member: "일반회원",
  verified_doctor: "의사인증회원",
});

export function isMembershipTier(value: unknown): value is MembershipTier {
  return (
    typeof value === "string" &&
    (MEMBERSHIP_TIERS as readonly string[]).includes(value)
  );
}

export function isProfileTier(value: unknown): value is ProfileTier {
  return (
    typeof value === "string" &&
    (PROFILE_TIERS as readonly string[]).includes(value)
  );
}

/** Returns true when `tier` ranks at or above `minimum`. */
export function tierAtLeast(tier: MembershipTier, minimum: MembershipTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minimum];
}

export function tierRank(tier: MembershipTier): number {
  return TIER_RANK[tier];
}
