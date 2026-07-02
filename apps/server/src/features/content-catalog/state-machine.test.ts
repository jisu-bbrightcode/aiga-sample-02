import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContentError } from "./errors.js";
import { assertTransition, canTransition, isPublishing } from "./state-machine.js";

describe("content state-machine", () => {
  it("allows the moderation happy path draft → pending_review → published", () => {
    assert.equal(canTransition("draft", "pending_review"), true);
    assert.equal(canTransition("pending_review", "published"), true);
  });

  it("treats a same-status transition as a no-op (allowed)", () => {
    assert.equal(canTransition("published", "published"), true);
  });

  it("rejects publishing directly from rejected", () => {
    assert.equal(canTransition("rejected", "published"), false);
  });

  it("assertTransition throws a typed ContentError on invalid moves", () => {
    assert.throws(() => assertTransition("archived", "pending_review"), (err: unknown) => {
      assert.ok(err instanceof ContentError);
      assert.equal(err.code, "INVALID_STATUS_TRANSITION");
      assert.equal(err.status, 409);
      return true;
    });
  });

  it("only stamps publishedAt on the first entry into published", () => {
    assert.equal(isPublishing("pending_review", "published"), true);
    assert.equal(isPublishing("published", "published"), false);
    assert.equal(isPublishing("draft", "archived"), false);
  });
});
