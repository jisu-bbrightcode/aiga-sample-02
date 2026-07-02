import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPublishing } from "./state-machine.js";

/**
 * The locked contract (BBR-1144 / BBR-1176) collapses the old moderation machine
 * into three free statuses `draft | published | hidden`. There is no gated
 * transition table any more — an admin publishes/hides/unpublishes directly — so
 * the only rule left to assert is the `publishedAt` stamp on first publish.
 */
describe("content state-machine — isPublishing", () => {
  it("is true on the first entry into published from draft or hidden", () => {
    assert.equal(isPublishing("draft", "published"), true);
    assert.equal(isPublishing("hidden", "published"), true);
  });

  it("is false when already published (no re-stamp on a published→published no-op)", () => {
    assert.equal(isPublishing("published", "published"), false);
  });

  it("is false for any transition that does not land on published", () => {
    assert.equal(isPublishing("draft", "hidden"), false);
    assert.equal(isPublishing("published", "hidden"), false);
    assert.equal(isPublishing("draft", "draft"), false);
  });
});
