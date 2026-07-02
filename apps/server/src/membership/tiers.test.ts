import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isMembershipTier,
  isProfileTier,
  tierAtLeast,
  tierRank,
  TIER_LABELS,
} from "./tiers.js";

test("tier ranking is strictly ordered guest < member < verified_doctor", () => {
  assert.ok(tierRank("guest") < tierRank("member"));
  assert.ok(tierRank("member") < tierRank("verified_doctor"));
});

test("tierAtLeast enforces minimum-tier gates", () => {
  assert.equal(tierAtLeast("verified_doctor", "member"), true);
  assert.equal(tierAtLeast("member", "member"), true);
  assert.equal(tierAtLeast("guest", "member"), false);
});

test("type guards distinguish membership vs profile tiers", () => {
  assert.equal(isMembershipTier("guest"), true);
  assert.equal(isMembershipTier("nope"), false);
  assert.equal(isProfileTier("member"), true);
  assert.equal(isProfileTier("guest"), false); // guest is never persisted
});

test("every tier has a Korean label", () => {
  assert.equal(TIER_LABELS.guest, "비회원");
  assert.equal(TIER_LABELS.member, "일반회원");
  assert.equal(TIER_LABELS.verified_doctor, "의사인증회원");
});
