/**
 * 전체 QA — 리뷰/평점 (Review & Rating) — BBR-1143
 *
 * The final ("full") QA stage for the feature. BE QA (BBR-1140) pinned the
 * controller/service contract and FE QA (BBR-1142) pinned the SPA UI; both drive
 * a single layer in isolation. This suite verifies the *assembled* feature end
 * to end, across the seams neither prior stage exercises:
 *
 *  §A. Acceptance journey — the whole scope as ONE continuous REST flow through
 *      the controller (parse → validate → domain → error-map), asserting status
 *      codes and aggregate transitions the unit suites only touch piecewise:
 *        · 의사인증회원 authorship gate + 전문가 뱃지 surfacing
 *        · 본인 프로필 제외 (self-review) + one-active-review-per-author
 *        · 평점 집계·노출 (average / count / distribution) across create/edit/delete
 *
 *  §B. Deployed HTTP pipeline — the REAL Express router from `http.ts` mounted
 *      with the REAL `requireTier` entitlement middleware (BBR-1121), driven by
 *      supertest over a DB-less fake. Proves the two-layer defense and the exact
 *      seam between them: the tier guard rejects with HttpError `forbidden`/
 *      `unauthorized` BEFORE the handler, while authorization that depends on
 *      membership state (NOT_DOCTOR_VERIFIED) is enforced by the service AFTER
 *      the guard passes. No other suite mounts this router.
 *
 *  §C. Wiring parity — the router registers exactly the method+path surface the
 *      declarative route table (`routes.ts`) documents, with write routes carrying
 *      a guard layer and public reads carrying none. Catches router/table drift.
 *
 * QA FINDING (documented, not a regression): the effective HTTP create gate is
 * `requireTier("verified_doctor")` in `http.ts`, which is STRICTER than the
 * `requiredRole: "member"` declared for the same route in `routes.ts`. §B pins
 * the enforced (safer) behavior; the table's role is advisory metadata, not the
 * wiring source of truth. Flagged for product/maintainers, see BBR-1143 report.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import {
  createReviewRatingController,
  type HandlerRequest,
  type HandlerResponse,
} from "../src/features/review-rating/controller.js";
import { reviewRatingRoutes } from "../src/features/review-rating/routes.js";
import { createReviewRatingRouter } from "../src/features/review-rating/http.js";
import { ReviewService } from "../src/features/review-rating/service.js";
import {
  FakeMembershipReader,
  InMemoryReviewRepository,
  makeBadge,
  makeDoctorBadge,
} from "../src/features/review-rating/testing/in-memory.js";
import { GUEST_PRINCIPAL, type Principal } from "../src/rbac/entitlement.js";
import type { MembershipTier } from "../src/membership/tiers.js";
// Side-effect import: brings the `Express.Request.principal` augmentation into
// scope so the test middleware below can assign `req.principal` type-cleanly.
import "../src/http/types.js";

// ---------------------------------------------------------------------------
// §A — Acceptance journey through the framework-agnostic controller
// ---------------------------------------------------------------------------

const DOCTOR = "doctor-1";
const DOCTOR_2 = "doctor-2";
const MEMBER = "member-1";
const ADMIN = "admin-1";
const TARGET = "target-1";

type Actor = HandlerRequest["actor"];
const doctor: Actor = { userId: DOCTOR, role: "member" };
const doctor2: Actor = { userId: DOCTOR_2, role: "member" };
const member: Actor = { userId: MEMBER, role: "member" };
const admin: Actor = { userId: ADMIN, role: "admin" };

function buildController() {
  const repo = new InMemoryReviewRepository();
  const membership = new FakeMembershipReader([
    makeDoctorBadge(DOCTOR, { displayName: "Dr. Kim", specialty: "내과" }),
    makeDoctorBadge(DOCTOR_2, { displayName: "Dr. Lee" }),
    makeBadge(MEMBER, { displayName: "Plain Member" }),
    makeBadge(ADMIN, { displayName: "Staff", tier: "member" }),
    makeBadge(TARGET, { displayName: "Target Profile" }),
  ]);
  return createReviewRatingController(new ReviewService({ repo, membership }));
}

type Req = {
  actor?: Actor;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
};

function req(overrides: Req = {}): HandlerRequest {
  return {
    actor: overrides.actor ?? null,
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body,
  };
}

/** Narrow an error-envelope body to its stable code. */
function codeOf(body: unknown): string | undefined {
  const err = (body as { error?: { code?: string } } | null)?.error;
  return err?.code;
}

describe("Review & Rating — 전체 QA · acceptance journey (controller)", () => {
  it("runs the full lifecycle: gate → author → aggregate → edit → delete → re-author", async () => {
    const c = buildController();
    const onTarget = { targetUserId: TARGET };

    // 1) Public summary of an unreviewed profile — open to guests, zeroed out.
    let res: HandlerResponse = await c.summary(req({ params: onTarget }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      targetUserId: TARGET,
      count: 0,
      average: null,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    });

    // 2) 작성 권한: a plain member cannot author (service tier gate).
    res = await c.create(
      req({ actor: member, params: onTarget, body: { rating: 5, body: "nope" } }),
    );
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "NOT_DOCTOR_VERIFIED");

    // 3) A verified doctor authors — 201 with the 전문가 뱃지 surfaced.
    res = await c.create(
      req({
        actor: doctor,
        params: onTarget,
        body: { rating: 4, title: "근거가 탄탄합니다", body: "동료 의료진에게 도움이 됩니다." },
      }),
    );
    assert.equal(res.status, 201);
    const created = res.body as {
      id: string;
      rating: number;
      author: { isExpert: boolean; expertBadge: string | null; specialty: string | null };
    };
    assert.equal(created.rating, 4);
    assert.equal(created.author.isExpert, true);
    assert.equal(created.author.expertBadge, "verified_doctor");
    assert.equal(created.author.specialty, "내과");
    const doctorReviewId = created.id;

    // 4) 본인 프로필 제외: a doctor cannot review their own profile.
    res = await c.create(
      req({ actor: doctor, params: { targetUserId: DOCTOR }, body: { rating: 5, body: "self" } }),
    );
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "SELF_REVIEW_FORBIDDEN");

    // 5) One active review per (author, target): a second create is a conflict.
    res = await c.create(
      req({ actor: doctor, params: onTarget, body: { rating: 3, body: "dup" } }),
    );
    assert.equal(res.status, 409);
    assert.equal(codeOf(res.body), "DUPLICATE_REVIEW");

    // 6) A second doctor authors — aggregate now spans two authors.
    res = await c.create(
      req({ actor: doctor2, params: onTarget, body: { rating: 5, body: "명료합니다." } }),
    );
    assert.equal(res.status, 201);

    // 7) 평점 집계·노출: average is the 2dp mean over active reviews (4,5 → 4.5).
    res = await c.summary(req({ params: onTarget }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      targetUserId: TARGET,
      count: 2,
      average: 4.5,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 },
    });

    // 8) Public list is guest-readable and enriched with author badges.
    res = await c.list(req({ params: onTarget }));
    assert.equal(res.status, 200);
    const page = res.body as { items: Array<{ author: { isExpert: boolean } }>; total: number };
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 2);
    assert.ok(page.items.every((r) => r.author.isExpert === true));

    // 9) Author edits in place — rating drops 4 → 2, no new row.
    res = await c.update(
      req({ actor: doctor, params: { id: doctorReviewId }, body: { rating: 2 } }),
    );
    assert.equal(res.status, 200);
    assert.equal((res.body as { rating: number }).rating, 2);

    // 10) Aggregate recomputes on edit; count is unchanged (2,5 → 3.5).
    res = await c.summary(req({ params: onTarget }));
    assert.equal((res.body as { count: number }).count, 2);
    assert.equal((res.body as { average: number }).average, 3.5);

    // 11) Non-author cannot edit someone else's review.
    res = await c.update(
      req({ actor: doctor2, params: { id: doctorReviewId }, body: { rating: 1 } }),
    );
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "FORBIDDEN");

    // 12a) Non-author, non-admin cannot delete.
    res = await c.remove(req({ actor: member, params: { id: doctorReviewId } }));
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "FORBIDDEN");

    // 12b) An admin may moderate (soft-delete) any review.
    res = await c.remove(req({ actor: admin, params: { id: doctorReviewId } }));
    assert.equal(res.status, 200);
    assert.equal((res.body as { status: string }).status, "deleted");

    // 13) A soft-deleted review is gone from public reads.
    res = await c.getOne(req({ params: { id: doctorReviewId } }));
    assert.equal(res.status, 404);
    assert.equal(codeOf(res.body), "REVIEW_NOT_FOUND");

    // 14) Aggregate excludes the deleted review (only doctor2's 5 remains).
    res = await c.summary(req({ params: onTarget }));
    assert.deepEqual(res.body, {
      targetUserId: TARGET,
      count: 1,
      average: 5,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
    });

    // 15) Soft-delete frees the (author, target) slot — the doctor can re-author.
    res = await c.create(
      req({ actor: doctor, params: onTarget, body: { rating: 5, body: "다시 남깁니다." } }),
    );
    assert.equal(res.status, 201);
  });

  it("rejects malformed writes at the validation boundary (400)", async () => {
    const c = buildController();
    const onTarget = { targetUserId: TARGET };

    // Out-of-range rating.
    let res = await c.create(
      req({ actor: doctor, params: onTarget, body: { rating: 6, body: "too high" } }),
    );
    assert.equal(res.status, 400);
    assert.equal(codeOf(res.body), "VALIDATION_ERROR");

    // Empty body string.
    res = await c.create(
      req({ actor: doctor, params: onTarget, body: { rating: 5, body: "" } }),
    );
    assert.equal(res.status, 400);

    // Empty PATCH — the "at least one field" refine rejects a no-op update.
    await c.create(
      req({ actor: doctor2, params: onTarget, body: { rating: 5, body: "seed" } }),
    );
    const list = (await c.list(req({ params: onTarget }))).body as { items: Array<{ id: string }> };
    const id = list.items[0]?.id;
    assert.ok(id, "expected a seeded review to edit");
    res = await c.update(req({ actor: doctor2, params: { id }, body: {} }));
    assert.equal(res.status, 400);
    assert.equal(codeOf(res.body), "VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// §B — Deployed HTTP pipeline: real router + real requireTier, DB-less
// ---------------------------------------------------------------------------

/**
 * A chainable + awaitable stand-in for a Drizzle db handle. Every query-builder
 * method returns the same thenable, which resolves to `[]`. That is enough for
 * the entitlement layer to be exercised without a database: guard rejections
 * short-circuit before any query runs, and guard-passing reads resolve to empty
 * results (count 0 / not-found) rather than a connection error.
 */
const emptyQuery: unknown = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === "then") return (resolve: (v: unknown[]) => void) => resolve([]);
    return () => emptyQuery;
  },
  apply() {
    return emptyQuery;
  },
});
const fakeDb = { select: () => emptyQuery, insert: () => emptyQuery, update: () => emptyQuery };

/** Minimal principal for a given tier (userId null only for guests). */
function principalFor(tier: MembershipTier, userId: string): Principal {
  if (tier === "guest") return GUEST_PRINCIPAL;
  return { userId, tier, roleKeys: [], rolePermissions: new Set() };
}

/**
 * Build an Express app that mirrors production ordering (json → principal →
 * feature router → errorHandler) but injects the request principal from an
 * `x-test-tier` header instead of a real session, and the DB-less fake instead
 * of a live pool. The `x-powered-by`-style auth is out of scope here — we only
 * assert the entitlement seam.
 */
function buildHttpHarness() {
  const app = express();
  app.use(express.json());
  app.use((reqE, _res, next) => {
    const tier = (reqE.header("x-test-tier") as MembershipTier | undefined) ?? "guest";
    reqE.principal = principalFor(tier, tier === "guest" ? "" : `${tier}-user`);
    next();
  });
  app.use("/api", createReviewRatingRouter({ db: fakeDb as never }));
  // Mirror the production error handler contract for HttpError → status+code.
  app.use(
    (
      err: unknown,
      _reqE: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const e = err as { status?: number; code?: string; message?: string };
      res
        .status(typeof e.status === "number" ? e.status : 500)
        .json({ ok: false, error: { code: e.code ?? "internal_error", message: e.message } });
    },
  );
  return app;
}

describe("Review & Rating — 전체 QA · deployed HTTP entitlement pipeline (supertest)", () => {
  const app = buildHttpHarness();

  it("public reads are guest-reachable through the mounted router", async () => {
    const summary = await request(app).get(`/api/profiles/${TARGET}/reviews/summary`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.count, 0);
    assert.equal(summary.body.average, null);

    const list = await request(app).get(`/api/profiles/${TARGET}/reviews`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items, []);
    assert.equal(list.body.total, 0);

    // A public read that resolves to no row is a domain 404, NOT an auth block.
    const one = await request(app).get(`/api/reviews/missing`);
    assert.equal(one.status, 404);
    assert.equal(one.body.error.code, "REVIEW_NOT_FOUND");
  });

  it("guest writes are stopped at the tier guard with 401 (before the handler)", async () => {
    const create = await request(app).post(`/api/profiles/${TARGET}/reviews`).send({ rating: 5, body: "x" });
    assert.equal(create.status, 401);
    assert.equal(create.body.error.code, "unauthorized");

    const patch = await request(app).patch(`/api/reviews/r1`).send({ rating: 5 });
    assert.equal(patch.status, 401);
    assert.equal(patch.body.error.code, "unauthorized");

    const del = await request(app).delete(`/api/reviews/r1`);
    assert.equal(del.status, 401);
    assert.equal(del.body.error.code, "unauthorized");
  });

  it("create requires verified_doctor at the HTTP guard — a member is 403 forbidden (guard, not service)", async () => {
    const res = await request(app)
      .post(`/api/profiles/${TARGET}/reviews`)
      .set("x-test-tier", "member")
      .send({ rating: 5, body: "x" });
    assert.equal(res.status, 403);
    // `forbidden` comes from requireTier (HttpError); the request never reaches
    // the service, so it is NOT the domain `NOT_DOCTOR_VERIFIED` code.
    assert.equal(res.body.error.code, "forbidden");
  });

  it("verified_doctor create passes the guard and reaches the service layer", async () => {
    const res = await request(app)
      .post(`/api/profiles/${TARGET}/reviews`)
      .set("x-test-tier", "verified_doctor")
      .send({ rating: 5, body: "helpful" });
    // Guard passed → handler ran. With the empty membership fake the service
    // then reports NOT_DOCTOR_VERIFIED (no profile row) — a *service* 403,
    // distinguishable from the guard's `forbidden` by its stable domain code.
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "NOT_DOCTOR_VERIFIED");
  });

  it("edit/delete admit any authenticated member at the guard (service then owns ownership)", async () => {
    const patch = await request(app)
      .patch(`/api/reviews/missing`)
      .set("x-test-tier", "member")
      .send({ rating: 3 });
    // Member cleared the `member` tier guard; the empty DB makes the target
    // review absent → domain 404, proving the guard did not block the member.
    assert.equal(patch.status, 404);
    assert.equal(patch.body.error.code, "REVIEW_NOT_FOUND");

    const del = await request(app)
      .delete(`/api/reviews/missing`)
      .set("x-test-tier", "member");
    assert.equal(del.status, 404);
    assert.equal(del.body.error.code, "REVIEW_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// §C — Wiring parity: router surface ↔ declared route table
// ---------------------------------------------------------------------------

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: ReadonlyArray<unknown>;
  };
}

/** Extract `{METHOD path}` + handler-layer count for each registered route. */
function registeredRoutes(): Array<{ key: string; handlerCount: number; methods: string[] }> {
  const router = createReviewRatingRouter({ db: fakeDb as never });
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  return stack
    .filter((l): l is Required<RouteLayer> => Boolean(l.route))
    .map((l) => {
      const methods = Object.keys(l.route.methods).filter((m) => l.route.methods[m]);
      return {
        key: `${methods.map((m) => m.toUpperCase()).sort().join(",")} ${l.route.path}`,
        handlerCount: l.route.stack.length,
        methods,
      };
    });
}

describe("Review & Rating — 전체 QA · router ↔ route-table wiring parity", () => {
  it("registers exactly the method+path surface the route table declares", () => {
    const declared = new Set(
      reviewRatingRoutes.map((r) => `${r.method.toUpperCase()} ${r.path}`),
    );
    const registered = new Set(registeredRoutes().map((r) => r.key));
    assert.deepEqual(
      [...registered].sort(),
      [...declared].sort(),
      "http.ts router and routes.ts table describe different endpoints",
    );
  });

  it("guards writes and leaves public reads ungated", () => {
    const byKey = new Map(registeredRoutes().map((r) => [r.key, r]));
    const declaredRole = new Map(
      reviewRatingRoutes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r.requiredRole]),
    );

    for (const [key, layer] of byKey) {
      const isRead = layer.methods.includes("get");
      if (isRead) {
        // Public reads: a single handler layer, no guard middleware.
        assert.equal(layer.handlerCount, 1, `${key} should be ungated (public read)`);
        assert.equal(declaredRole.get(key), "public", `${key} should be declared public`);
      } else {
        // Writes: guard middleware + the handler.
        assert.equal(layer.handlerCount, 2, `${key} should carry a tier guard`);
      }
    }
  });
});
