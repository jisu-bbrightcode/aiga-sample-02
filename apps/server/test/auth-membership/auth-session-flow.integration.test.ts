import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  entitlementForRole,
  requireAdmin,
  requireAuth,
  requirePermission,
  requireTier,
} from "../../src/http/middleware/entitlement.js";
import { resolvePolicy } from "../../src/membership/policy.js";
import { TIER_LABELS } from "../../src/membership/tiers.js";
import { effectivePermissions } from "../../src/rbac/entitlement.js";
import { PERMISSIONS } from "../../src/rbac/permissions.js";
import { makeAdmin, makePrincipal, runGuards } from "./harness.js";

/**
 * 회원가입 · 로그인 · 세션 통합 테스트 — BE QA (BBR-1122).
 *
 * The register/login/logout endpoints delegate to better-auth (cookie-backed,
 * DB-backed) so they can't be exercised deterministically without a live stack.
 * What those flows *establish* — and what every downstream feature route relies
 * on — is the session→principal→entitlement authorization contract. This suite
 * drives the real entitlement guards through each lifecycle state:
 *
 *   pre-register / post-logout  → guest principal (no session)
 *   post-register (default)      → member principal
 *   after doctor verification    → verified_doctor principal
 *   staff account                → member/doctor tier + admin role
 *
 * and pins the 401-vs-403 semantics plus the enriched-session entitlement view.
 */

const P = PERMISSIONS;

describe("guest lifecycle (no session — before register / after logout)", () => {
  // `null` principal == request that never had a session attached.
  const guest = null;

  it("public read routes (requireTier guest) are open to guests", () => {
    const outcome = runGuards([requireTier("guest")], guest);
    assert.equal(outcome.passed, true);
  });

  it("requireAuth rejects a guest with 401 (not 403)", () => {
    const outcome = runGuards([requireAuth()], guest);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.status, 401);
  });

  it("member-gated routes reject a guest with 401 (authentication first)", () => {
    const outcome = runGuards([requireTier("member")], guest);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.status, 401);
  });

  it("requirePermission demands authentication even for a guest-granted permission", () => {
    // guests DO have content.read via the tier matrix, but requirePermission
    // gates on authentication first — an unauthenticated caller gets 401.
    const outcome = runGuards([requirePermission(P.contentRead)], guest);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.status, 401);
  });
});

describe("member lifecycle (post-register default tier)", () => {
  const member = makePrincipal({ tier: "member" });

  it("passes requireAuth and requireTier('member')", () => {
    assert.equal(runGuards([requireAuth()], member).passed, true);
    assert.equal(runGuards([requireTier("member")], member).passed, true);
  });

  it("passes member-granted permissions (content authoring, reviews)", () => {
    const outcome = runGuards(
      [requirePermission(P.contentCreate, P.reviewCreate)],
      member,
    );
    assert.equal(outcome.passed, true);
  });

  it("is forbidden (403) from verified_doctor-only routes", () => {
    assert.equal(runGuards([requireTier("verified_doctor")], member).status, 403);
    assert.equal(runGuards([requirePermission(P.expertAnswer)], member).status, 403);
  });

  it("is forbidden (403) from admin surfaces (tier never grants admin)", () => {
    assert.equal(runGuards([requireAdmin()], member).status, 403);
  });
});

describe("verified_doctor lifecycle (after license approval)", () => {
  const doctor = makePrincipal({ tier: "verified_doctor" });

  it("passes verified_doctor tier and expert permissions", () => {
    assert.equal(runGuards([requireTier("verified_doctor")], doctor).passed, true);
    assert.equal(
      runGuards([requirePermission(P.expertAnswer, P.expertBadgeDisplay)], doctor)
        .passed,
      true,
    );
  });

  it("still inherits all member permissions", () => {
    assert.equal(
      runGuards([requirePermission(P.contentCreate, P.reviewCreate)], doctor)
        .passed,
      true,
    );
  });

  it("is still forbidden (403) from admin surfaces", () => {
    assert.equal(runGuards([requireAdmin()], doctor).status, 403);
  });
});

describe("entitlementForRole — base-router integration contract (BBR-1117)", () => {
  const guest = null;
  const member = makePrincipal({ tier: "member" });
  const admin = makeAdmin([P.adminAccess]);

  it("role 'member' behaves as requireTier('member')", () => {
    assert.equal(runGuards([entitlementForRole("member")], guest).status, 401);
    assert.equal(runGuards([entitlementForRole("member")], member).passed, true);
  });

  it("role 'admin' behaves as requireAdmin()", () => {
    assert.equal(runGuards([entitlementForRole("admin")], guest).status, 401);
    assert.equal(runGuards([entitlementForRole("admin")], member).status, 403);
    assert.equal(runGuards([entitlementForRole("admin")], admin).passed, true);
  });
});

describe("enriched session (GET /api/v1/auth/session) entitlement contract", () => {
  // Mirror the exact enrichment the session controller emits, per principal,
  // so the {tier, tierLabel, permissions, policy, authenticated} shape is pinned.
  it("an anonymous session reports guest tier with read-only entitlements", () => {
    const principal = makePrincipal({ userId: null, tier: "guest" });
    assert.equal(principal.userId !== null, false); // authenticated flag
    assert.equal(TIER_LABELS[principal.tier], "비회원");
    assert.deepEqual([...effectivePermissions(principal)].sort(), [
      P.contentRead,
    ]);
    assert.equal(resolvePolicy(principal.tier).canWriteReview, false);
  });

  it("a member session carries member entitlements and policy", () => {
    const principal = makePrincipal({ tier: "member" });
    assert.equal(TIER_LABELS[principal.tier], "일반회원");
    const perms = [...effectivePermissions(principal)];
    assert.ok(perms.includes(P.reviewCreate));
    assert.ok(!perms.includes(P.expertAnswer));
    assert.equal(resolvePolicy(principal.tier).dailyPostLimit, 20);
  });

  it("a verified_doctor session exposes expert entitlements and unlimited posting", () => {
    const principal = makePrincipal({ tier: "verified_doctor" });
    assert.equal(TIER_LABELS[principal.tier], "의사인증회원");
    const perms = [...effectivePermissions(principal)];
    assert.ok(perms.includes(P.expertAnswer));
    assert.equal(resolvePolicy(principal.tier).dailyPostLimit, null);
    assert.equal(resolvePolicy(principal.tier).showExpertBadge, true);
  });

  it("a staff session unions admin permissions on top of its tier", () => {
    const principal = makeAdmin(
      [P.adminAccess, P.adminUsersRead, P.adminUsersUpdate],
      "member",
    );
    const perms = [...effectivePermissions(principal)];
    assert.ok(perms.includes(P.adminUsersUpdate)); // role axis
    assert.ok(perms.includes(P.contentCreate)); // tier axis
    assert.deepEqual([...principal.roleKeys], ["admin"]);
  });
});
