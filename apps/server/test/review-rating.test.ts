import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createReviewRatingController,
  type HandlerRequest,
} from "../src/features/review-rating/controller.js";
import { ReviewError } from "../src/features/review-rating/errors.js";
import { ReviewService } from "../src/features/review-rating/service.js";
import {
  FakeMembershipReader,
  InMemoryReviewRepository,
  makeBadge,
  makeDoctorBadge,
} from "../src/features/review-rating/testing/in-memory.js";

const DOCTOR = "doctor-1";
const DOCTOR_2 = "doctor-2";
const TARGET = "target-1";
const MEMBER = "member-1";

/** Build a service with a doctor author, a second doctor, a plain member, and a target. */
function buildService() {
  const repo = new InMemoryReviewRepository();
  const membership = new FakeMembershipReader([
    makeDoctorBadge(DOCTOR, { displayName: "Dr. Kim", specialty: "내과" }),
    makeDoctorBadge(DOCTOR_2, { displayName: "Dr. Lee" }),
    makeBadge(MEMBER, { displayName: "Plain Member" }),
    makeBadge(TARGET, { displayName: "Target Profile" }),
  ]);
  return { repo, membership, service: new ReviewService({ repo, membership }) };
}

const baseInput = { rating: 5, title: "Great", body: "Very helpful." };

test("create: verified doctor can review a target, with expert badge attached", async () => {
  const { service } = buildService();
  const view = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });

  assert.equal(view.rating, 5);
  assert.equal(view.status, "active");
  assert.equal(view.author.isExpert, true);
  assert.equal(view.author.expertBadge, "verified_doctor");
  assert.equal(view.author.specialty, "내과");
  assert.equal(view.author.displayName, "Dr. Kim");
});

test("create: non-doctor member is rejected (NOT_DOCTOR_VERIFIED)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: MEMBER, targetUserId: TARGET, ...baseInput }),
    (e: unknown) => e instanceof ReviewError && e.code === "NOT_DOCTOR_VERIFIED" && e.status === 403,
  );
});

test("create: unknown author is rejected (NOT_DOCTOR_VERIFIED)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: "ghost", targetUserId: TARGET, ...baseInput }),
    (e: unknown) => e instanceof ReviewError && e.code === "NOT_DOCTOR_VERIFIED",
  );
});

test("create: cannot review own profile (SELF_REVIEW_FORBIDDEN)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: DOCTOR, targetUserId: DOCTOR, ...baseInput }),
    (e: unknown) => e instanceof ReviewError && e.code === "SELF_REVIEW_FORBIDDEN",
  );
});

test("create: target profile must exist (TARGET_NOT_FOUND)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: DOCTOR, targetUserId: "nobody", ...baseInput }),
    (e: unknown) => e instanceof ReviewError && e.code === "TARGET_NOT_FOUND" && e.status === 404,
  );
});

test("create: one active review per (author, target) — duplicate rejected", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });
  await assert.rejects(
    service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput }),
    (e: unknown) => e instanceof ReviewError && e.code === "DUPLICATE_REVIEW" && e.status === 409,
  );
});

test("update: author can edit rating/body; non-author is forbidden", async () => {
  const { service } = buildService();
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });

  const updated = await service.update({
    reviewId: created.id,
    authorId: DOCTOR,
    rating: 3,
    body: "Revised opinion.",
  });
  assert.equal(updated.rating, 3);
  assert.equal(updated.body, "Revised opinion.");

  await assert.rejects(
    service.update({ reviewId: created.id, authorId: DOCTOR_2, rating: 1 }),
    (e: unknown) => e instanceof ReviewError && e.code === "FORBIDDEN",
  );
});

test("delete: author soft-deletes; review disappears from reads and aggregation", async () => {
  const { service } = buildService();
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });

  const deleted = await service.delete({ reviewId: created.id, actorId: DOCTOR, isAdmin: false });
  assert.equal(deleted.status, "deleted");
  assert.ok(deleted.deletedAt);

  await assert.rejects(
    service.getReview(created.id),
    (e: unknown) => e instanceof ReviewError && e.code === "REVIEW_NOT_FOUND",
  );
  const page = await service.listByTarget({ targetUserId: TARGET, sort: "recent", limit: 20, offset: 0 });
  assert.equal(page.total, 0);
  const summary = await service.getRatingSummary(TARGET);
  assert.equal(summary.count, 0);
  assert.equal(summary.average, null);
});

test("delete: a non-author member cannot delete; an admin can", async () => {
  const { service } = buildService();
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });

  await assert.rejects(
    service.delete({ reviewId: created.id, actorId: DOCTOR_2, isAdmin: false }),
    (e: unknown) => e instanceof ReviewError && e.code === "FORBIDDEN",
  );

  const deleted = await service.delete({ reviewId: created.id, actorId: "admin-x", isAdmin: true });
  assert.equal(deleted.status, "deleted");
});

test("after soft-delete, the same author can review the target again", async () => {
  const { service } = buildService();
  const first = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });
  await service.delete({ reviewId: first.id, actorId: DOCTOR, isAdmin: false });
  const second = await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 4, title: null, body: "Second." });
  assert.equal(second.status, "active");
  assert.notEqual(second.id, first.id);
});

test("rating summary: average, count, and star distribution are correct", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  await service.create({ authorId: DOCTOR_2, targetUserId: TARGET, rating: 2, title: null, body: "b" });

  const summary = await service.getRatingSummary(TARGET);
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 3.5);
  assert.deepEqual(summary.distribution, { "1": 0, "2": 1, "3": 0, "4": 0, "5": 1 });
});

test("list: reviews are enriched with author badges and can be sorted by rating", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  await service.create({ authorId: DOCTOR_2, targetUserId: TARGET, rating: 2, title: null, body: "b" });

  const asc = await service.listByTarget({ targetUserId: TARGET, sort: "rating_asc", limit: 20, offset: 0 });
  assert.equal(asc.total, 2);
  assert.deepEqual(asc.items.map((r) => r.rating), [2, 5]);
  assert.equal(asc.items[0]?.author.isExpert, true);

  const desc = await service.listByTarget({ targetUserId: TARGET, sort: "rating_desc", limit: 20, offset: 0 });
  assert.deepEqual(desc.items.map((r) => r.rating), [5, 2]);
});

// --- Controller-level checks (validation + error-to-HTTP mapping) -------------

function makeReq(over: Partial<HandlerRequest>): HandlerRequest {
  return { actor: null, params: {}, query: {}, body: {}, ...over };
}

test("controller: create maps validation errors to 400", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const res = await controller.create(
    makeReq({
      actor: { userId: DOCTOR, role: "member" },
      params: { targetUserId: TARGET },
      body: { rating: 9, body: "" }, // rating out of range + empty body
    }),
  );
  assert.equal(res.status, 400);
});

test("controller: create returns 201 with the review body on success", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const res = await controller.create(
    makeReq({
      actor: { userId: DOCTOR, role: "member" },
      params: { targetUserId: TARGET },
      body: { rating: 4, title: "Nice", body: "Solid advice." },
    }),
  );
  assert.equal(res.status, 201);
  const body = res.body as { rating: number; author: { isExpert: boolean } };
  assert.equal(body.rating, 4);
  assert.equal(body.author.isExpert, true);
});

test("controller: unauthenticated write is 401", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const res = await controller.create(
    makeReq({ actor: null, params: { targetUserId: TARGET }, body: { rating: 4, body: "x" } }),
  );
  assert.equal(res.status, 401);
});

test("controller: public list works without an actor", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...baseInput });
  const controller = createReviewRatingController(service);
  const res = await controller.list(makeReq({ params: { targetUserId: TARGET } }));
  assert.equal(res.status, 200);
  const body = res.body as { total: number };
  assert.equal(body.total, 1);
});

test("controller: self-review maps to 403", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const res = await controller.create(
    makeReq({
      actor: { userId: DOCTOR, role: "member" },
      params: { targetUserId: DOCTOR },
      body: { rating: 4, body: "x" },
    }),
  );
  assert.equal(res.status, 403);
});
