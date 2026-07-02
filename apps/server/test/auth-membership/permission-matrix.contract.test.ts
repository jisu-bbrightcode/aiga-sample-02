import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMON_POLICY,
  type MembershipPolicy,
  resolvePolicy,
} from "../../src/membership/policy.js";
import {
  MEMBERSHIP_TIERS,
  type MembershipTier,
  TIER_LABELS,
  tierAtLeast,
  tierRank,
} from "../../src/membership/tiers.js";
import { resolveTierPermissions, tierHasPermission } from "../../src/rbac/matrix.js";
import {
  can,
  effectivePermissions,
  GUEST_PRINCIPAL,
  isAuthenticated,
  type Principal,
} from "../../src/rbac/entitlement.js";
import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSIONS,
  type PermissionKey,
} from "../../src/rbac/permissions.js";

/**
 * 등급별 권한 매트릭스 계약 테스트 — BE QA (BBR-1122).
 *
 * This is the *authoritative golden contract* for the 3-tier membership model
 * (비회원 / 일반회원 / 의사인증회원). The developer unit tests spot-check
 * individual grants; here we pin the ENTIRE resolved matrix and policy per tier.
 * Any drift in `rbac/matrix.ts`, `membership/policy.ts`, or the permission
 * catalog forces this contract to be consciously updated — the point of a QA
 * contract test.
 */

const P = PERMISSIONS;

/** The exact set of membership permissions each tier must resolve to. */
const EXPECTED_TIER_PERMISSIONS: Readonly<
  Record<MembershipTier, readonly PermissionKey[]>
> = {
  // 비회원 — read public content only.
  guest: [P.contentRead],
  // 일반회원 — inherits guest, adds authoring / community / review / own-profile.
  member: [
    P.contentRead,
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
  // 의사인증회원 — inherits member, adds verified-expert capabilities.
  verified_doctor: [
    P.contentRead,
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
    P.expertAnswer,
    P.expertBadgeDisplay,
  ],
};

/** The exact resolved policy each tier must produce. */
const EXPECTED_POLICY: Readonly<Record<MembershipTier, MembershipPolicy>> = {
  guest: {
    canBrowsePublic: true,
    canCreateContent: false,
    canParticipateCommunity: false,
    canWriteReview: false,
    canAnswerAsExpert: false,
    showExpertBadge: false,
    contentVisibility: "public",
    dailyPostLimit: 0,
    dailyPostViewLimit: 10,
    maxUploadMb: 0,
  },
  member: {
    canBrowsePublic: true,
    canCreateContent: true,
    canParticipateCommunity: true,
    canWriteReview: true,
    canAnswerAsExpert: false,
    showExpertBadge: false,
    contentVisibility: "members",
    dailyPostLimit: 20,
    dailyPostViewLimit: 50,
    maxUploadMb: 10,
  },
  verified_doctor: {
    canBrowsePublic: true,
    canCreateContent: true,
    canParticipateCommunity: true,
    canWriteReview: true,
    canAnswerAsExpert: true,
    showExpertBadge: true,
    contentVisibility: "all",
    dailyPostLimit: null,
    dailyPostViewLimit: null,
    maxUploadMb: 50,
  },
};

const sorted = (perms: Iterable<PermissionKey>): PermissionKey[] =>
  [...perms].sort();

describe("permission matrix contract — resolved grants per tier", () => {
  for (const tier of MEMBERSHIP_TIERS) {
    it(`${tier} (${TIER_LABELS[tier]}) grants exactly the contracted permissions`, () => {
      const resolved = sorted(resolveTierPermissions(tier));
      const expected = sorted(EXPECTED_TIER_PERMISSIONS[tier]);
      assert.deepEqual(resolved, expected);
    });
  }

  it("the three tiers are exhaustive (no undocumented tier exists)", () => {
    assert.deepEqual([...MEMBERSHIP_TIERS], [
      "guest",
      "member",
      "verified_doctor",
    ]);
  });
});

describe("permission matrix contract — inheritance is cumulative", () => {
  it("member is a strict superset of guest", () => {
    const guest = resolveTierPermissions("guest");
    const member = resolveTierPermissions("member");
    for (const perm of guest) assert.ok(member.has(perm), `member missing ${perm}`);
    assert.ok(member.size > guest.size);
  });

  it("verified_doctor is a strict superset of member", () => {
    const member = resolveTierPermissions("member");
    const doctor = resolveTierPermissions("verified_doctor");
    for (const perm of member) assert.ok(doctor.has(perm), `doctor missing ${perm}`);
    assert.ok(doctor.size > member.size);
  });

  it("only verified_doctor holds expert capabilities", () => {
    for (const tier of MEMBERSHIP_TIERS) {
      const expected = tier === "verified_doctor";
      assert.equal(tierHasPermission(tier, P.expertAnswer), expected);
      assert.equal(tierHasPermission(tier, P.expertBadgeDisplay), expected);
    }
  });
});

describe("permission matrix contract — staff axis is orthogonal to tier", () => {
  it("no membership tier grants any admin/staff permission", () => {
    for (const tier of MEMBERSHIP_TIERS) {
      for (const adminPerm of ADMIN_PERMISSIONS) {
        assert.equal(
          tierHasPermission(tier, adminPerm),
          false,
          `${tier} must not grant ${adminPerm} via membership`,
        );
      }
    }
  });

  it("admin permissions are disjoint from every tier's membership grants", () => {
    const allTierGranted = new Set<PermissionKey>();
    for (const tier of MEMBERSHIP_TIERS) {
      for (const perm of resolveTierPermissions(tier)) allTierGranted.add(perm);
    }
    for (const adminPerm of ADMIN_PERMISSIONS) {
      assert.ok(
        !allTierGranted.has(adminPerm),
        `${adminPerm} leaked into a membership tier`,
      );
    }
  });

  it("every catalogued permission is a known key", () => {
    assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
  });
});

describe("membership policy contract — full resolved policy per tier", () => {
  for (const tier of MEMBERSHIP_TIERS) {
    it(`${tier} resolves to the exact contracted policy`, () => {
      assert.deepEqual(resolvePolicy(tier), EXPECTED_POLICY[tier]);
    });
  }

  it("resolving a policy never mutates the shared common baseline", () => {
    resolvePolicy("verified_doctor");
    assert.equal(COMMON_POLICY.canAnswerAsExpert, false);
    assert.equal(COMMON_POLICY.dailyPostLimit, 0);
    assert.equal(COMMON_POLICY.contentVisibility, "public");
  });

  it("resolved policies are frozen (immutable at runtime)", () => {
    const policy = resolvePolicy("member");
    assert.throws(() => {
      (policy as { canCreateContent: boolean }).canCreateContent = false;
    });
  });
});

describe("tier ordering contract", () => {
  it("ranks strictly increase guest < member < verified_doctor", () => {
    assert.ok(tierRank("guest") < tierRank("member"));
    assert.ok(tierRank("member") < tierRank("verified_doctor"));
  });

  it("tierAtLeast holds for the full pairwise ordering", () => {
    const order: MembershipTier[] = ["guest", "member", "verified_doctor"];
    for (let hi = 0; hi < order.length; hi++) {
      for (let lo = 0; lo < order.length; lo++) {
        const high = order[hi]!;
        const low = order[lo]!;
        assert.equal(tierAtLeast(high, low), hi >= lo, `${high} vs ${low}`);
      }
    }
  });

  it("Korean labels are contracted per tier", () => {
    assert.equal(TIER_LABELS.guest, "비회원");
    assert.equal(TIER_LABELS.member, "일반회원");
    assert.equal(TIER_LABELS.verified_doctor, "의사인증회원");
  });
});

describe("principal entitlement contract — pure tier vs role union", () => {
  const pureTier = (tier: MembershipTier): Principal => ({
    userId: tier === "guest" ? null : "u",
    tier,
    roleKeys: [],
    rolePermissions: new Set<PermissionKey>(),
  });

  it("the guest principal constant is unauthenticated and read-only", () => {
    assert.equal(isAuthenticated(GUEST_PRINCIPAL), false);
    assert.equal(GUEST_PRINCIPAL.tier, "guest");
    assert.equal(can(GUEST_PRINCIPAL, P.contentRead), true);
    assert.equal(can(GUEST_PRINCIPAL, P.contentCreate), false);
  });

  for (const tier of MEMBERSHIP_TIERS) {
    it(`a pure-${tier} principal's effective permissions equal its tier matrix`, () => {
      const principal = pureTier(tier);
      assert.deepEqual(
        sorted(effectivePermissions(principal)),
        sorted(EXPECTED_TIER_PERMISSIONS[tier]),
      );
    });
  }

  it("staff role permissions union with (never replace) tier permissions", () => {
    const adminMember: Principal = {
      userId: "admin-1",
      tier: "member",
      roleKeys: ["admin"],
      rolePermissions: new Set<PermissionKey>([
        P.adminAccess,
        P.adminUsersRead,
        P.adminUsersUpdate,
      ]),
    };
    const perms = effectivePermissions(adminMember);
    // tier grants preserved
    assert.ok(perms.has(P.contentCreate));
    assert.ok(perms.has(P.reviewCreate));
    // role grants added
    assert.ok(perms.has(P.adminAccess));
    assert.ok(perms.has(P.adminUsersUpdate));
    // tier still confers no expert capability (member, not doctor)
    assert.equal(perms.has(P.expertAnswer), false);
  });
});
