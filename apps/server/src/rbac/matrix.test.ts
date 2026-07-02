import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTierPermissions, tierHasPermission } from "./matrix.js";
import { PERMISSIONS } from "./permissions.js";

test("guest can only read content", () => {
  assert.equal(tierHasPermission("guest", PERMISSIONS.contentRead), true);
  assert.equal(tierHasPermission("guest", PERMISSIONS.contentCreate), false);
  assert.equal(tierHasPermission("guest", PERMISSIONS.reviewCreate), false);
});

test("member inherits guest permissions and adds authoring/community/review", () => {
  assert.equal(tierHasPermission("member", PERMISSIONS.contentRead), true); // inherited
  assert.equal(tierHasPermission("member", PERMISSIONS.contentCreate), true);
  assert.equal(tierHasPermission("member", PERMISSIONS.communityPost), true);
  assert.equal(tierHasPermission("member", PERMISSIONS.reviewCreate), true);
  assert.equal(tierHasPermission("member", PERMISSIONS.expertAnswer), false);
});

test("verified_doctor inherits member permissions and adds expert capabilities", () => {
  assert.equal(tierHasPermission("verified_doctor", PERMISSIONS.contentRead), true);
  assert.equal(tierHasPermission("verified_doctor", PERMISSIONS.reviewCreate), true);
  assert.equal(tierHasPermission("verified_doctor", PERMISSIONS.expertAnswer), true);
  assert.equal(
    tierHasPermission("verified_doctor", PERMISSIONS.expertBadgeDisplay),
    true,
  );
});

test("membership tiers never grant admin permissions", () => {
  for (const tier of ["guest", "member", "verified_doctor"] as const) {
    assert.equal(tierHasPermission(tier, PERMISSIONS.adminAccess), false);
    assert.equal(tierHasPermission(tier, PERMISSIONS.adminUsersUpdate), false);
  }
});

test("permission sets grow monotonically with tier rank", () => {
  const guest = resolveTierPermissions("guest").size;
  const member = resolveTierPermissions("member").size;
  const doctor = resolveTierPermissions("verified_doctor").size;
  assert.ok(guest < member, "member should have more permissions than guest");
  assert.ok(doctor > member, "doctor should have more permissions than member");
});
