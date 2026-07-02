import { MEMBERSHIP_TIERS, type MembershipTier } from "./tiers.js";

/**
 * Membership policy (등급 정책).
 *
 * Design: the common policy is defined exactly once (`COMMON_POLICY`), and each
 * tier declares only the fields it overrides (`TIER_OVERRIDES`). `resolvePolicy`
 * merges the two so every tier has a complete, immutable policy without the
 * defaults being repeated per tier.
 */
export interface MembershipPolicy {
  /** Can browse public catalog/content without extra gating. */
  readonly canBrowsePublic: boolean;
  /** Can author catalog content. */
  readonly canCreateContent: boolean;
  /** Can create community posts / comments / reactions. */
  readonly canParticipateCommunity: boolean;
  /** Can write reviews & ratings. */
  readonly canWriteReview: boolean;
  /** Can answer as a verified expert (doctor-only capability). */
  readonly canAnswerAsExpert: boolean;
  /** Whether the expert badge is displayed on this member's content. */
  readonly showExpertBadge: boolean;
  /** Visibility scope this tier is allowed to read. */
  readonly contentVisibility: "public" | "members" | "all";
  /** Max community posts per day (rate policy). `null` = unlimited. */
  readonly dailyPostLimit: number | null;
  /**
   * Max distinct community posts a member of this tier may *view* (열람) per
   * rolling 24h window. `null` = unlimited. Distinct from `dailyPostLimit`,
   * which caps post *creation*. Enforced by the community view-limit service
   * (BBR-1168 scope): exceed → `429 POST_VIEW_DAILY_LIMIT_EXCEEDED`.
   */
  readonly dailyPostViewLimit: number | null;
  /** Max attachment upload size in MB. */
  readonly maxUploadMb: number;
}

/**
 * Common baseline applied to every tier. Defined once; tiers override deltas.
 */
export const COMMON_POLICY: MembershipPolicy = Object.freeze({
  canBrowsePublic: true,
  canCreateContent: false,
  canParticipateCommunity: false,
  canWriteReview: false,
  canAnswerAsExpert: false,
  showExpertBadge: false,
  contentVisibility: "public",
  dailyPostLimit: 0,
  dailyPostViewLimit: 10, // guests may browse a limited number of posts/day
  maxUploadMb: 0,
});

/**
 * Per-tier overrides. Only the fields that differ from `COMMON_POLICY` are
 * listed, keeping the policy matrix declarative and DRY.
 */
export const TIER_OVERRIDES: Readonly<
  Record<MembershipTier, Partial<MembershipPolicy>>
> = Object.freeze({
  guest: {
    // Pure baseline: browse public only.
  },
  member: {
    canCreateContent: true,
    canParticipateCommunity: true,
    canWriteReview: true,
    contentVisibility: "members",
    dailyPostLimit: 20,
    dailyPostViewLimit: 50, // larger daily browse allowance for members
    maxUploadMb: 10,
  },
  verified_doctor: {
    canCreateContent: true,
    canParticipateCommunity: true,
    canWriteReview: true,
    canAnswerAsExpert: true,
    showExpertBadge: true,
    contentVisibility: "all",
    dailyPostLimit: null, // unlimited
    dailyPostViewLimit: null, // unlimited browsing for verified doctors
    maxUploadMb: 50,
  },
});

const RESOLVED: Readonly<Record<MembershipTier, MembershipPolicy>> = Object.freeze(
  Object.fromEntries(
    MEMBERSHIP_TIERS.map((tier) => [
      tier,
      Object.freeze({ ...COMMON_POLICY, ...TIER_OVERRIDES[tier] }),
    ]),
  ) as Record<MembershipTier, MembershipPolicy>,
);

/**
 * Resolve the complete, immutable policy for a tier by merging the common
 * baseline with the tier's overrides. Precomputed, so this is a cheap lookup.
 */
export function resolvePolicy(tier: MembershipTier): MembershipPolicy {
  return RESOLVED[tier];
}
