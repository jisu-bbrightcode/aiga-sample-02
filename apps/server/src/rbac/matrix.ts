import type { MembershipTier } from "../membership/tiers.js";
import { MEMBERSHIP_TIERS } from "../membership/tiers.js";
import { PERMISSIONS, type PermissionKey } from "./permissions.js";

const P = PERMISSIONS;

/**
 * 3-tier membership permission matrix (등급별 권한 매트릭스).
 *
 * Each tier lists only the permissions it *adds* on top of the tier below it;
 * `resolveTierPermissions` accumulates them so a `verified_doctor` inherits
 * everything a `member` has, which in turn inherits from `guest`.
 */
const TIER_GRANTS: Readonly<Record<MembershipTier, readonly PermissionKey[]>> =
  Object.freeze({
    guest: [P.contentRead],
    member: [
      P.contentCreate,
      P.contentUpdateOwn,
      P.contentDeleteOwn,
      P.communityPost,
      P.communityComment,
      P.communityReact,
      P.reviewCreate,
      P.reviewUpdateOwn,
      P.profileReadOwn,
      P.profileUpdateOwn,
    ],
    verified_doctor: [P.expertAnswer, P.expertBadgeDisplay],
  });

/** Inheritance order, least → most privileged. */
const TIER_CHAIN: readonly MembershipTier[] = MEMBERSHIP_TIERS;

const RESOLVED: Readonly<Record<MembershipTier, ReadonlySet<PermissionKey>>> =
  Object.freeze(
    Object.fromEntries(
      TIER_CHAIN.map((tier, idx) => {
        const acc = new Set<PermissionKey>();
        for (const lower of TIER_CHAIN.slice(0, idx + 1)) {
          for (const perm of TIER_GRANTS[lower]) acc.add(perm);
        }
        return [tier, acc as ReadonlySet<PermissionKey>];
      }),
    ) as Record<MembershipTier, ReadonlySet<PermissionKey>>,
  );

/** All permissions granted to a membership tier (inherited from lower tiers). */
export function resolveTierPermissions(
  tier: MembershipTier,
): ReadonlySet<PermissionKey> {
  return RESOLVED[tier];
}

/** True when the tier alone grants `permission` (ignores staff roles). */
export function tierHasPermission(
  tier: MembershipTier,
  permission: PermissionKey,
): boolean {
  return RESOLVED[tier].has(permission);
}
