/**
 * BE QA — 리뷰/평점 (Review & Rating) — BBR-1140
 *
 * QA hardening suite that complements the dev tests in `review-rating.test.ts`.
 * It targets edge cases the happy-path suite does not exercise, organized by the
 * three QA deliverables:
 *
 *  1. 작성 권한(의사인증회원/본인제외) 검증 — authorship & self-exclusion
 *  2. 평점 집계 정확성           — rating aggregation accuracy
 *  3. 리뷰 CRUD 계약             — CRUD contract completeness
 *
 * It also carries two regression tests for defects found during this QA pass and
 * fixed in `validation.ts`:
 *   - REG-A: a rating-only PATCH must NOT wipe an existing title (data loss).
 *   - REG-B: an empty PATCH `{}` must be rejected 400 (defeated refine).
 */
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
const DOCTOR_3 = "doctor-3";
const TARGET = "target-1";
const TARGET_2 = "target-2";
const MEMBER = "member-1";
const EXPERT_MEMBER = "expert-member-1";

function buildService() {
  const repo = new InMemoryReviewRepository();
  const membership = new FakeMembershipReader([
    makeDoctorBadge(DOCTOR, { displayName: "Dr. Kim", specialty: "내과" }),
    makeDoctorBadge(DOCTOR_2, { displayName: "Dr. Lee" }),
    makeDoctorBadge(DOCTOR_3, { displayName: "Dr. Park" }),
    makeBadge(MEMBER, { displayName: "Plain Member" }),
    // A member who *claims* expert status but is NOT verified_doctor tier.
    makeBadge(EXPERT_MEMBER, { displayName: "Faux Expert", isExpert: true, expertBadge: "verified_doctor" }),
    makeBadge(TARGET, { displayName: "Target Profile" }),
    makeBadge(TARGET_2, { displayName: "Second Target" }),
  ]);
  return { repo, membership, service: new ReviewService({ repo, membership }) };
}

const base = { rating: 5, title: "Great", body: "Very helpful." };

const makeReq = (over: Partial<HandlerRequest>): HandlerRequest => ({
  actor: null,
  params: {},
  query: {},
  body: {},
  ...over,
});

// ---------------------------------------------------------------------------
// Deliverable 1 — 작성 권한(의사인증회원/본인제외) 검증
// ---------------------------------------------------------------------------

test("authz: tier gate is evaluated before self-exclusion (non-doctor self-review → NOT_DOCTOR_VERIFIED)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: MEMBER, targetUserId: MEMBER, ...base }),
    (e: unknown) => e instanceof ReviewError && e.code === "NOT_DOCTOR_VERIFIED",
  );
});

test("authz: isExpert flag alone does NOT authorize — only verified_doctor tier does", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: EXPERT_MEMBER, targetUserId: TARGET, ...base }),
    (e: unknown) => e instanceof ReviewError && e.code === "NOT_DOCTOR_VERIFIED" && e.status === 403,
  );
});

test("authz: a verified doctor still cannot review their own profile (SELF_REVIEW_FORBIDDEN)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.create({ authorId: DOCTOR, targetUserId: DOCTOR, ...base }),
    (e: unknown) => e instanceof ReviewError && e.code === "SELF_REVIEW_FORBIDDEN" && e.status === 403,
  );
});

// ---------------------------------------------------------------------------
// Deliverable 2 — 평점 집계 정확성 (aggregation accuracy)
// ---------------------------------------------------------------------------

test("aggregation: average is rounded to 2 decimals for non-terminating means (5,4,4 → 4.33)", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  await service.create({ authorId: DOCTOR_2, targetUserId: TARGET, rating: 4, title: null, body: "b" });
  await service.create({ authorId: DOCTOR_3, targetUserId: TARGET, rating: 4, title: null, body: "c" });

  const summary = await service.getRatingSummary(TARGET);
  assert.equal(summary.count, 3);
  assert.equal(summary.average, 4.33);
  assert.deepEqual(summary.distribution, { "1": 0, "2": 0, "3": 0, "4": 2, "5": 1 });
});

test("aggregation: a single review yields average equal to its rating", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 3, title: null, body: "a" });
  const summary = await service.getRatingSummary(TARGET);
  assert.equal(summary.count, 1);
  assert.equal(summary.average, 3);
});

test("aggregation: is isolated per target — another profile's reviews never leak in", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  await service.create({ authorId: DOCTOR, targetUserId: TARGET_2, rating: 1, title: null, body: "b" });
  await service.create({ authorId: DOCTOR_2, targetUserId: TARGET_2, rating: 1, title: null, body: "c" });

  const s1 = await service.getRatingSummary(TARGET);
  assert.equal(s1.count, 1);
  assert.equal(s1.average, 5);

  const s2 = await service.getRatingSummary(TARGET_2);
  assert.equal(s2.count, 2);
  assert.equal(s2.average, 1);
});

test("aggregation: soft-deleted reviews are excluded while remaining actives still count", async () => {
  const { service } = buildService();
  const r1 = await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  await service.create({ authorId: DOCTOR_2, targetUserId: TARGET, rating: 1, title: null, body: "b" });

  await service.delete({ reviewId: r1.id, actorId: DOCTOR, isAdmin: false });

  const summary = await service.getRatingSummary(TARGET);
  assert.equal(summary.count, 1);
  assert.equal(summary.average, 1);
  assert.deepEqual(summary.distribution, { "1": 1, "2": 0, "3": 0, "4": 0, "5": 0 });
});

test("aggregation: empty target has count 0, null average, and a zeroed distribution", async () => {
  const { service } = buildService();
  const summary = await service.getRatingSummary("nobody");
  assert.equal(summary.count, 0);
  assert.equal(summary.average, null);
  assert.deepEqual(summary.distribution, { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
});

// ---------------------------------------------------------------------------
// Deliverable 3 — 리뷰 CRUD 계약 (contract completeness)
// ---------------------------------------------------------------------------

test("read: getReview returns an active review enriched with the author badge", async () => {
  const { service } = buildService();
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });
  const got = await service.getReview(created.id);
  assert.equal(got.id, created.id);
  assert.equal(got.author.isExpert, true);
  assert.equal(got.author.specialty, "내과");
});

test("read: getReview on an unknown id → REVIEW_NOT_FOUND (404)", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.getReview("does-not-exist"),
    (e: unknown) => e instanceof ReviewError && e.code === "REVIEW_NOT_FOUND" && e.status === 404,
  );
});

test("update: on an unknown review → REVIEW_NOT_FOUND", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.update({ reviewId: "ghost", authorId: DOCTOR, rating: 2 }),
    (e: unknown) => e instanceof ReviewError && e.code === "REVIEW_NOT_FOUND",
  );
});

test("update: on a soft-deleted review → REVIEW_NOT_FOUND (deleted rows are not editable)", async () => {
  const { service } = buildService();
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });
  await service.delete({ reviewId: created.id, actorId: DOCTOR, isAdmin: false });
  await assert.rejects(
    service.update({ reviewId: created.id, authorId: DOCTOR, rating: 2 }),
    (e: unknown) => e instanceof ReviewError && e.code === "REVIEW_NOT_FOUND",
  );
});

test("delete: on an unknown review → REVIEW_NOT_FOUND; double-delete is likewise rejected", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.delete({ reviewId: "ghost", actorId: DOCTOR, isAdmin: false }),
    (e: unknown) => e instanceof ReviewError && e.code === "REVIEW_NOT_FOUND",
  );
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });
  await service.delete({ reviewId: created.id, actorId: DOCTOR, isAdmin: false });
  await assert.rejects(
    service.delete({ reviewId: created.id, actorId: DOCTOR, isAdmin: false }),
    (e: unknown) => e instanceof ReviewError && e.code === "REVIEW_NOT_FOUND",
  );
});

test("list: paginates — items honour limit/offset while total reflects the full active set", async () => {
  const { service } = buildService();
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  await service.create({ authorId: DOCTOR_2, targetUserId: TARGET, rating: 4, title: null, body: "b" });
  await service.create({ authorId: DOCTOR_3, targetUserId: TARGET, rating: 3, title: null, body: "c" });

  const page1 = await service.listByTarget({ targetUserId: TARGET, sort: "rating_desc", limit: 2, offset: 0 });
  assert.equal(page1.total, 3);
  assert.equal(page1.items.length, 2);
  assert.deepEqual(page1.items.map((r) => r.rating), [5, 4]);

  const page2 = await service.listByTarget({ targetUserId: TARGET, sort: "rating_desc", limit: 2, offset: 2 });
  assert.equal(page2.total, 3);
  assert.equal(page2.items.length, 1);
  assert.deepEqual(page2.items.map((r) => r.rating), [3]);
});

test("list: default 'recent' sort orders newest-first", async () => {
  const { service } = buildService();
  const first = await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: null, body: "a" });
  const second = await service.create({ authorId: DOCTOR_2, targetUserId: TARGET, rating: 4, title: null, body: "b" });
  const page = await service.listByTarget({ targetUserId: TARGET, sort: "recent", limit: 20, offset: 0 });
  assert.deepEqual(page.items.map((r) => r.id), [second.id, first.id]);
});

// --- Regression tests for defects found & fixed during this QA pass ---------

test("REG-A: a rating-only PATCH must NOT wipe an existing title (data-loss guard)", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: "Keep Me", body: "x" });

  const res = await controller.update(
    makeReq({ actor: { userId: DOCTOR, role: "member" }, params: { id: created.id }, body: { rating: 3 } }),
  );
  assert.equal(res.status, 200);
  const body = res.body as { rating: number; title: string | null };
  assert.equal(body.rating, 3);
  assert.equal(body.title, "Keep Me");
});

test("REG-B: an empty PATCH {} is rejected with 400 (at-least-one-field refine)", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });
  const res = await controller.update(
    makeReq({ actor: { userId: DOCTOR, role: "member" }, params: { id: created.id }, body: {} }),
  );
  assert.equal(res.status, 400);
});

test("update: an explicit blank/empty title clears it to null (opt-in clear still works)", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 5, title: "Original", body: "x" });
  const res = await controller.update(
    makeReq({ actor: { userId: DOCTOR, role: "member" }, params: { id: created.id }, body: { title: "   " } }),
  );
  assert.equal(res.status, 200);
  assert.equal((res.body as { title: string | null }).title, null);
});

// --- Controller contract: handlers not covered by the dev suite -------------

test("controller: getOne returns 200 for an active review and 404 after delete", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });

  const okRes = await controller.getOne(makeReq({ params: { id: created.id } }));
  assert.equal(okRes.status, 200);

  await service.delete({ reviewId: created.id, actorId: DOCTOR, isAdmin: false });
  const goneRes = await controller.getOne(makeReq({ params: { id: created.id } }));
  assert.equal(goneRes.status, 404);
});

test("controller: update by a non-author maps to 403", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });
  const res = await controller.update(
    makeReq({ actor: { userId: DOCTOR_2, role: "member" }, params: { id: created.id }, body: { rating: 1 } }),
  );
  assert.equal(res.status, 403);
});

test("controller: remove returns 200 with soft-delete envelope; admin may remove another's review", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const created = await service.create({ authorId: DOCTOR, targetUserId: TARGET, ...base });

  const res = await controller.remove(
    makeReq({ actor: { userId: "admin-x", role: "admin" }, params: { id: created.id } }),
  );
  assert.equal(res.status, 200);
  const body = res.body as { id: string; status: string; deletedAt: unknown };
  assert.equal(body.status, "deleted");
  assert.ok(body.deletedAt);
});

test("controller: summary returns 200 with the aggregation envelope", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  await service.create({ authorId: DOCTOR, targetUserId: TARGET, rating: 4, title: null, body: "a" });
  const res = await controller.summary(makeReq({ params: { targetUserId: TARGET } }));
  assert.equal(res.status, 200);
  const body = res.body as { count: number; average: number | null };
  assert.equal(body.count, 1);
  assert.equal(body.average, 4);
});

test("controller: a write with a missing path param → 400 (not a 500)", async () => {
  const { service } = buildService();
  const controller = createReviewRatingController(service);
  const res = await controller.create(
    makeReq({ actor: { userId: DOCTOR, role: "member" }, params: {}, body: { rating: 4, body: "x" } }),
  );
  assert.equal(res.status, 400);
});
