import assert from "node:assert/strict";
import { test } from "node:test";

import {
  can,
  canAll,
  canAny,
  effectivePermissions,
  GUEST_PRINCIPAL,
  isAuthenticated,
  type Principal,
} from "./entitlement.js";
import { PERMISSIONS, type PermissionKey } from "./permissions.js";

function principal(overrides: Partial<Principal>): Principal {
  return {
    userId: "u1",
    tier: "member",
    roleKeys: [],
    rolePermissions: new Set<PermissionKey>(),
    ...overrides,
  };
}

test("guest principal is unauthenticated and read-only", () => {
  assert.equal(isAuthenticated(GUEST_PRINCIPAL), false);
  assert.equal(can(GUEST_PRINCIPAL, PERMISSIONS.contentRead), true);
  assert.equal(can(GUEST_PRINCIPAL, PERMISSIONS.contentCreate), false);
});

test("effective permissions unite tier and staff-role grants", () => {
  const admin = principal({
    tier: "member",
    roleKeys: ["admin"],
    rolePermissions: new Set([
      PERMISSIONS.adminAccess,
      PERMISSIONS.adminUsersUpdate,
    ]),
  });
  const perms = effectivePermissions(admin);
  assert.ok(perms.has(PERMISSIONS.contentCreate)); // tier grant
  assert.ok(perms.has(PERMISSIONS.adminUsersUpdate)); // role grant
});

test("a member without an admin role cannot access admin permissions", () => {
  const member = principal({ tier: "verified_doctor" });
  assert.equal(can(member, PERMISSIONS.adminAccess), false);
  assert.equal(can(member, PERMISSIONS.expertAnswer), true); // tier grant
});

test("canAll requires every permission; canAny requires at least one", () => {
  const member = principal({ tier: "member" });
  assert.equal(
    canAll(member, [PERMISSIONS.contentCreate, PERMISSIONS.reviewCreate]),
    true,
  );
  assert.equal(
    canAll(member, [PERMISSIONS.contentCreate, PERMISSIONS.adminAccess]),
    false,
  );
  assert.equal(
    canAny(member, [PERMISSIONS.adminAccess, PERMISSIONS.reviewCreate]),
    true,
  );
});
