import assert from "node:assert/strict";
import { test } from "node:test";

import { COMMON_POLICY, resolvePolicy } from "./policy.js";

test("guest resolves to the common baseline (browse public only)", () => {
  const policy = resolvePolicy("guest");
  assert.equal(policy.canBrowsePublic, true);
  assert.equal(policy.canCreateContent, false);
  assert.equal(policy.canParticipateCommunity, false);
  assert.equal(policy.canWriteReview, false);
  assert.equal(policy.canAnswerAsExpert, false);
  assert.equal(policy.dailyPostLimit, 0);
});

test("member overrides participation fields on top of the common baseline", () => {
  const policy = resolvePolicy("member");
  assert.equal(policy.canCreateContent, true);
  assert.equal(policy.canParticipateCommunity, true);
  assert.equal(policy.canWriteReview, true);
  assert.equal(policy.canAnswerAsExpert, false); // still not an expert
  assert.equal(policy.contentVisibility, "members");
  assert.equal(policy.dailyPostLimit, 20);
});

test("verified_doctor gains expert capabilities and unlimited posting", () => {
  const policy = resolvePolicy("verified_doctor");
  assert.equal(policy.canAnswerAsExpert, true);
  assert.equal(policy.showExpertBadge, true);
  assert.equal(policy.contentVisibility, "all");
  assert.equal(policy.dailyPostLimit, null);
  assert.equal(policy.maxUploadMb, 50);
});

test("common policy is defined exactly once and not mutated by resolution", () => {
  resolvePolicy("verified_doctor");
  assert.equal(COMMON_POLICY.canAnswerAsExpert, false);
  assert.equal(COMMON_POLICY.dailyPostLimit, 0);
});

test("resolved policies are frozen (immutable)", () => {
  const policy = resolvePolicy("member");
  assert.throws(() => {
    // @ts-expect-error — runtime immutability check
    policy.canCreateContent = false;
  });
});
