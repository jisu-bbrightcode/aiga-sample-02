/**
 * 전체 QA — 커뮤니티/게시글/댓글/반응 (Community & Posts) — BBR-1137
 *
 * The final ("full") QA stage for the feature. BE QA (BBR-1134,
 * `community.qa.test.ts`) pinned the controller/service contract edge-by-edge and
 * FE QA (BBR-1136, `src/community-post.test.tsx`) pinned the SPA UI; each drives a
 * single layer in isolation. This suite verifies the *assembled* feature end to
 * end, across the seams neither prior stage exercises:
 *
 *  §A. Acceptance journey — the whole scope as ONE continuous flow through the
 *      framework-agnostic controller (parse → validate → domain → error-map),
 *      asserting the status codes and aggregate transitions the unit suites only
 *      touch piecewise:
 *        · 게시글/댓글/반응 CRUD + 집계 (reaction count, comment visibility)
 *        · 참여 권한 게이트 (guest 403 PARTICIPATION_FORBIDDEN) + 소유권 (403 FORBIDDEN)
 *        · 관리자 모더레이션 (lock/remove/restore/crosspost/sanction/content) + audit
 *        · 전문가 뱃지 surfacing on authored content (verified_doctor)
 *      plus the 등급별 열람 일일 제한 429 *through the controller* on distinct-post
 *      overflow, which BE QA only proves at the service layer / for re-views.
 *
 *  §B. Deployed HTTP pipeline — the REAL Express router from `http.ts` mounted
 *      with the REAL `requireTier`/`requireAdmin` entitlement middleware
 *      (BBR-1121), driven by supertest over a DB-less fake. Proves the two-layer
 *      defense and the exact seam between them: the entitlement guard rejects
 *      guests/non-admins with HttpError `unauthorized`/`forbidden` BEFORE the
 *      handler runs, while authorization that depends on domain state
 *      (POST_NOT_FOUND / USER_NOT_FOUND) is enforced by the service AFTER the
 *      guard passes. No other suite mounts this router.
 *
 *  §C. Wiring parity — the router registers exactly the method+path surface the
 *      declarative route table (`routes.ts`) documents, with write routes carrying
 *      a guard layer and public reads carrying none. Catches router/table drift.
 *
 * QA FINDING (documented, not a regression): the community participation gate is
 * enforced TWICE with different surfaced codes depending on entry path. Through
 * the HTTP pipeline a guest write is stopped at `requireTier("member")` with
 * `401 unauthorized` BEFORE the handler; through the controller directly the
 * service's `assertCanParticipate` returns `403 PARTICIPATION_FORBIDDEN`. Both
 * deny (defense-in-depth, safe), but the service's domain 403 is *shadowed* by
 * the guard's 401 on the deployed path. §A pins the controller 403 and §B pins
 * the HTTP 401; flagged for product/maintainers, see the BBR-1137 report.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import {
  createCommunityController,
  type HandlerRequest,
  type HandlerResponse,
} from "../src/features/community/controller.js";
import { communityRoutes } from "../src/features/community/routes.js";
import { createCommunityRouter } from "../src/features/community/http.js";
import { createCommunityServices } from "../src/features/community/service.js";
import type { Actor } from "../src/features/community/types.js";
import {
  FakeMembershipReader,
  InMemoryCommentRepository,
  InMemoryModerationRepository,
  InMemoryPostRepository,
  InMemoryPostViewRepository,
  InMemoryReactionRepository,
  MutableClock,
  SequentialIdGenerator,
  makeBadge,
  makeDoctorBadge,
} from "../src/features/community/testing/in-memory.js";
import { GUEST_PRINCIPAL, type Principal } from "../src/rbac/entitlement.js";
import { PERMISSIONS } from "../src/rbac/permissions.js";
import type { MembershipTier } from "../src/membership/tiers.js";
// Side-effect import: brings the `Express.Request.principal` augmentation into
// scope so the test middleware below can assign `req.principal` type-cleanly.
import "../src/http/types.js";

// ---------------------------------------------------------------------------
// Shared identities
// ---------------------------------------------------------------------------

const AUTHOR = "member-author";
const OTHER = "member-other";
const DOCTOR = "doctor-1";
const ADMIN = "admin-1";

const guest: Actor = { userId: null, tier: "guest", isAdmin: false, ip: "203.0.113.7" };
const author: Actor = { userId: AUTHOR, tier: "member", isAdmin: false, ip: null };
const other: Actor = { userId: OTHER, tier: "member", isAdmin: false, ip: null };
const doctor: Actor = { userId: DOCTOR, tier: "verified_doctor", isAdmin: false, ip: null };
const admin: Actor = { userId: ADMIN, tier: "member", isAdmin: true, ip: null };

function buildController() {
  const posts = new InMemoryPostRepository();
  const comments = new InMemoryCommentRepository();
  const reactions = new InMemoryReactionRepository();
  const moderation = new InMemoryModerationRepository();
  const views = new InMemoryPostViewRepository();
  const membership = new FakeMembershipReader([
    makeBadge(AUTHOR, { displayName: "김건강" }),
    makeBadge(OTHER, { displayName: "이웃" }),
    makeBadge(ADMIN, { displayName: "운영자" }),
    makeDoctorBadge(DOCTOR, { displayName: "닥터 최", specialty: "내과" }),
  ]);
  const clock = new MutableClock();
  const ids = new SequentialIdGenerator();
  const services = createCommunityServices({
    posts,
    comments,
    reactions,
    moderation,
    views,
    membership,
    clock,
    ids,
  });
  return { controller: createCommunityController(services), moderation, clock };
}

type Req = Partial<Pick<HandlerRequest, "params" | "query" | "body">>;
const req = (actor: Actor, parts: Req = {}): HandlerRequest => ({
  actor,
  params: parts.params ?? {},
  query: parts.query ?? {},
  body: parts.body ?? {},
});

/** Narrow an error-envelope body to its stable code. */
const codeOf = (body: unknown): string | undefined =>
  (body as { error?: { code?: string } } | null)?.error?.code;

// ---------------------------------------------------------------------------
// §A — Acceptance journey through the framework-agnostic controller
// ---------------------------------------------------------------------------

describe("Community — 전체 QA · acceptance journey (controller)", () => {
  it("runs the whole scope: gate → author → read → comment → react → moderate → own-delete", async () => {
    const { controller: c, moderation } = buildController();

    // 1) Public list of an empty community — open to guests, zeroed out.
    let res: HandlerResponse = await c.listPosts(req(guest));
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as { total: number; items: unknown[] }).total, 0);

    // 2) 참여 권한: a guest cannot author a post (service participation gate).
    res = await c.createPost(req(guest, { body: { title: "Hi", body: "there" } }));
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "PARTICIPATION_FORBIDDEN"); // (see §B for the HTTP 401 twin)

    // 3) A member authors a post — 201, author badge is a plain member.
    res = await c.createPost(
      req(author, { body: { title: "한강 러닝 후기", body: "좋았어요", category: " 운동 " } }),
    );
    assert.equal(res.status, 201);
    const p1 = res.body as {
      id: string;
      category: string | null;
      reactionCount: number;
      author: { isExpert: boolean; displayName: string | null };
    };
    assert.equal(p1.category, "운동"); // trimmed at the boundary
    assert.equal(p1.reactionCount, 0);
    assert.equal(p1.author.isExpert, false);
    assert.equal(p1.author.displayName, "김건강");

    // 4) A verified doctor authors — 전문가 뱃지 surfaces on the read model.
    res = await c.createPost(req(doctor, { body: { title: "의학 정보", body: "근거 자료" } }));
    assert.equal(res.status, 201);
    const p2 = res.body as { id: string; author: { isExpert: boolean; expertBadge: string | null; specialty: string | null } };
    assert.equal(p2.author.isExpert, true);
    assert.equal(p2.author.expertBadge, "verified_doctor");
    assert.equal(p2.author.specialty, "내과");

    // 5) 열람: a guest reads P1 — allowed within the daily bucket, viewCount bumps.
    res = await c.getPost(req(guest, { params: { id: p1.id } }));
    assert.equal(res.status, 200);
    assert.equal((res.body as { viewCount: number }).viewCount, 1);

    // 6) A guest cannot comment (participation gate again).
    res = await c.createComment(req(guest, { params: { postId: p1.id }, body: { body: "hi" } }));
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "PARTICIPATION_FORBIDDEN");

    // 7) Another member comments — listComments reflects the count.
    res = await c.createComment(req(other, { params: { postId: p1.id }, body: { body: "저도요!" } }));
    assert.equal(res.status, 201);
    const commentId = (res.body as { id: string }).id;
    res = await c.listComments(req(guest, { params: { postId: p1.id } }));
    assert.equal((res.body as { items: unknown[] }).items.length, 1);

    // 8) 반응: author reacts, other reacts — distinct users accumulate; re-cast is idempotent.
    res = await c.react(req(author, { params: { postId: p1.id }, body: { kind: "upvote" } }));
    assert.equal(res.status, 201);
    assert.equal((res.body as { reactionCount: number; changed: boolean }).changed, true);
    res = await c.react(req(other, { params: { postId: p1.id }, body: { kind: "like" } }));
    assert.equal((res.body as { reactionCount: number }).reactionCount, 2);
    res = await c.react(req(other, { params: { postId: p1.id }, body: { kind: "like" } }));
    assert.equal(res.status, 200); // unchanged re-cast → 200, not 201
    assert.equal((res.body as { reactionCount: number; changed: boolean }).changed, false);
    assert.equal((res.body as { reactionCount: number }).reactionCount, 2);

    // 9) list surfaces reaction counts and floats an admin-pinned post first.
    await c.moderatePost(req(admin, { params: { id: p1.id }, body: { action: "pin" } }));
    res = await c.listPosts(req(guest));
    const listed = res.body as { total: number; items: Array<{ id: string; pinned: boolean; reactionCount: number }> };
    assert.equal(listed.total, 2);
    assert.equal(listed.items[0]!.id, p1.id);
    assert.equal(listed.items[0]!.pinned, true);
    assert.equal(listed.items[0]!.reactionCount, 2);

    // 10) Admin locks P1: edits/comments freeze, but reactions still flow
    //     (documented product behaviour — cross-refs BE QA C6).
    await c.moderatePost(req(admin, { params: { id: p1.id }, body: { action: "lock" } }));
    res = await c.updatePost(req(author, { params: { id: p1.id }, body: { title: "수정?" } }));
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "POST_LOCKED");
    res = await c.createComment(req(other, { params: { postId: p1.id }, body: { body: "막힘?" } }));
    assert.equal(codeOf(res.body), "POST_LOCKED");
    res = await c.react(req(doctor, { params: { postId: p1.id }, body: { kind: "like" } }));
    assert.equal(res.status, 201); // reaction on a locked post: allowed
    await c.moderatePost(req(admin, { params: { id: p1.id }, body: { action: "unlock" } }));

    // 11) 소유권: a non-author member cannot edit or delete someone else's post.
    res = await c.updatePost(req(other, { params: { id: p1.id }, body: { title: "가로채기" } }));
    assert.equal(res.status, 403);
    assert.equal(codeOf(res.body), "FORBIDDEN");
    res = await c.deletePost(req(other, { params: { id: p1.id } }));
    assert.equal(codeOf(res.body), "FORBIDDEN");

    // 12) Admin comment moderation removes a comment → hidden from the public list; audited.
    res = await c.moderateComment(req(admin, { params: { id: commentId }, body: { action: "remove" } }));
    assert.equal(res.status, 200);
    assert.equal((res.body as { audit: { action: string } }).audit.action, "remove");
    res = await c.listComments(req(guest, { params: { postId: p1.id } }));
    assert.equal((res.body as { items: unknown[] }).items.length, 0);

    // 13) Admin remove/restore of P2: hidden from members, visible to admin, then restored.
    await c.moderatePost(req(admin, { params: { id: p2.id }, body: { action: "remove" } }));
    assert.equal((await c.getPost(req(other, { params: { id: p2.id } }))).status, 404);
    assert.equal((await c.getPost(req(admin, { params: { id: p2.id } }))).status, 200);
    await c.moderatePost(req(admin, { params: { id: p2.id }, body: { action: "restore" } }));
    assert.equal((await c.getPost(req(other, { params: { id: p2.id } }))).status, 200);

    // 14) Admin crosspost + content-moderation + user-sanction all write audit rows
    //     attributed to the acting admin.
    await c.moderatePost(
      req(admin, { params: { id: p2.id }, body: { action: "crosspost", crosspostOf: p1.id } }),
    );
    await c.contentModeration(
      req(admin, { body: { targetType: "post", targetId: p1.id, action: "hide" } }),
    );
    res = await c.sanction(req(admin, { body: { targetUserId: OTHER, kind: "mute", reason: "spam" } }));
    assert.equal(res.status, 200);
    // Sanctioning a user with no membership row → 404.
    assert.equal((await c.sanction(req(admin, { body: { targetUserId: "ghost" } }))).status, 404);

    const audit = moderation.all();
    assert.ok(audit.every((e) => e.actorId === ADMIN), "every audit row is attributed to the admin");
    assert.ok(audit.some((e) => e.action === "crosspost"));
    assert.ok(audit.some((e) => e.action === "content_moderation"));
    assert.ok(audit.some((e) => e.action === "sanction" && e.targetId === OTHER));

    // 15) The author deletes their own post → soft-deleted, then invisible to all.
    res = await c.deletePost(req(author, { params: { id: p1.id } }));
    assert.equal(res.status, 200);
    assert.equal((res.body as { status: string }).status, "deleted");
    assert.equal((await c.getPost(req(admin, { params: { id: p1.id } }))).status, 404);
  });

  it("rejects malformed writes at the assembled validation boundary (400)", async () => {
    const { controller: c } = buildController();
    const postId = ((await c.createPost(req(author, { body: { title: "seed", body: "seed" } }))).body as { id: string }).id;

    // Whitespace-only title trims to empty → min-length 400.
    assert.equal((await c.createPost(req(author, { body: { title: "   ", body: "x" } }))).status, 400);
    // Comment past the 4000-char cap.
    assert.equal(
      (await c.createComment(req(author, { params: { postId }, body: { body: "c".repeat(4001) } }))).status,
      400,
    );
    // Unknown reaction kind.
    assert.equal(
      (await c.react(req(author, { params: { postId }, body: { kind: "wow" } }))).status,
      400,
    );
    // Out-of-range pagination.
    assert.equal((await c.listPosts(req(author, { query: { limit: "101" } }))).status, 400);
    // Empty PATCH (at-least-one-field rule).
    assert.equal((await c.updatePost(req(author, { params: { id: postId }, body: {} }))).status, 400);
  });

  it("enforces the 등급별 열람 일일 제한 through getPost — guest 11th distinct view → 429", async () => {
    const { controller: c } = buildController();
    // Guest daily view cap is 10 distinct posts (membership/policy.ts).
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      ids.push(((await c.createPost(req(author, { body: { title: `p${i}`, body: "b" } }))).body as { id: string }).id);
    }
    for (let i = 0; i < 10; i++) {
      assert.equal((await c.getPost(req(guest, { params: { id: ids[i]! } }))).status, 200, `view ${i + 1} allowed`);
    }
    const over = await c.getPost(req(guest, { params: { id: ids[10]! } }));
    assert.equal(over.status, 429);
    assert.equal(codeOf(over.body), "POST_VIEW_DAILY_LIMIT_EXCEEDED");

    // A verified doctor is unlimited on the same assembled path.
    for (const id of ids) {
      assert.equal((await c.getPost(req(doctor, { params: { id } }))).status, 200);
    }
  });
});

// ---------------------------------------------------------------------------
// §B — Deployed HTTP pipeline: real router + real entitlement guards, DB-less
// ---------------------------------------------------------------------------

/**
 * A chainable + awaitable stand-in for a Drizzle db handle. Every query-builder
 * method returns the same thenable, which resolves to `[]`. That is enough for
 * the entitlement layer to be exercised without a database: guard rejections
 * short-circuit before any query runs, and guard-passing reads/lookups resolve
 * to empty results (list total 0 / not-found) rather than a connection error.
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
const fakeDb = {
  select: () => emptyQuery,
  insert: () => emptyQuery,
  update: () => emptyQuery,
  delete: () => emptyQuery,
};

/** Build a request principal for a tier, optionally granting the admin role permission. */
function principalFor(tier: MembershipTier, userId: string, isAdmin: boolean): Principal {
  if (tier === "guest" && !isAdmin) return GUEST_PRINCIPAL;
  return {
    userId,
    tier,
    roleKeys: isAdmin ? ["admin"] : [],
    rolePermissions: isAdmin ? new Set([PERMISSIONS.adminAccess]) : new Set(),
  };
}

/**
 * Express app mirroring production ordering (json → principal → feature router →
 * errorHandler) but injecting the principal from `x-test-tier` / `x-test-admin`
 * headers instead of a real session, and the DB-less fake instead of a live pool.
 * We assert only the entitlement seam + domain fall-through, not auth.
 */
function buildHttpHarness() {
  const app = express();
  app.use(express.json());
  app.use((reqE, _res, next) => {
    const tier = (reqE.header("x-test-tier") as MembershipTier | undefined) ?? "guest";
    const isAdmin = reqE.header("x-test-admin") === "1";
    reqE.principal = principalFor(tier, tier === "guest" ? "" : `${tier}-user`, isAdmin);
    next();
  });
  app.use("/api", createCommunityRouter({ db: fakeDb as never }));
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
        .json({ error: { code: e.code ?? "internal_error", message: e.message } });
    },
  );
  return app;
}

describe("Community — 전체 QA · deployed HTTP entitlement pipeline (supertest)", () => {
  const app = buildHttpHarness();

  it("public reads are guest-reachable through the mounted router", async () => {
    // Empty list resolves cleanly (total 0) — proves the read path reaches the service.
    const list = await request(app).get("/api/posts");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items, []);
    assert.equal(list.body.total, 0);

    // A public detail read of a missing post is a domain 404, NOT an auth block.
    const detail = await request(app).get("/api/posts/ghost");
    assert.equal(detail.status, 404);
    assert.equal(detail.body.error.code, "POST_NOT_FOUND");

    // Comment list on a missing post is also a domain 404 (public read reached service).
    const comments = await request(app).get("/api/posts/ghost/comments");
    assert.equal(comments.status, 404);
    assert.equal(comments.body.error.code, "POST_NOT_FOUND");
  });

  it("guest writes are stopped at the tier guard with 401 (before the handler)", async () => {
    // NOTE (QA FINDING): the controller-direct path returns 403 PARTICIPATION_FORBIDDEN
    // for a guest (see §A step 2); the deployed path is stopped one layer earlier by
    // requireTier("member") with 401 — the service 403 is shadowed here.
    const post = await request(app).post("/api/posts").send({ title: "x", body: "y" });
    assert.equal(post.status, 401);
    assert.equal(post.body.error.code, "unauthorized");

    const comment = await request(app).post("/api/posts/p1/comments").send({ body: "x" });
    assert.equal(comment.status, 401);
    assert.equal(comment.body.error.code, "unauthorized");

    const react = await request(app).post("/api/posts/p1/reactions").send({ kind: "like" });
    assert.equal(react.status, 401);
    assert.equal(react.body.error.code, "unauthorized");
  });

  it("member writes clear the tier guard and reach the service (domain 404, not auth)", async () => {
    // Each write below passes requireTier("member"); with the empty DB the target
    // post is absent, so the SERVICE returns POST_NOT_FOUND — proving the guard let
    // the member through rather than blocking with 401/403.
    const patch = await request(app)
      .patch("/api/posts/missing")
      .set("x-test-tier", "member")
      .send({ title: "edit" });
    assert.equal(patch.status, 404);
    assert.equal(patch.body.error.code, "POST_NOT_FOUND");

    const del = await request(app)
      .delete("/api/posts/missing")
      .set("x-test-tier", "member");
    assert.equal(del.status, 404);
    assert.equal(del.body.error.code, "POST_NOT_FOUND");

    const comment = await request(app)
      .post("/api/posts/missing/comments")
      .set("x-test-tier", "member")
      .send({ body: "hi" });
    assert.equal(comment.status, 404);
    assert.equal(comment.body.error.code, "POST_NOT_FOUND");

    const react = await request(app)
      .post("/api/posts/missing/reactions")
      .set("x-test-tier", "member")
      .send({ kind: "like" });
    assert.equal(react.status, 404);
    assert.equal(react.body.error.code, "POST_NOT_FOUND");
  });

  it("admin surface: guest → 401, non-admin member → 403 (guard), admin → reaches service", async () => {
    // Guest hits requireAdmin unauthenticated → 401.
    const guestSanction = await request(app)
      .post("/api/moderation/sanctions")
      .send({ targetUserId: "u1" });
    assert.equal(guestSanction.status, 401);
    assert.equal(guestSanction.body.error.code, "unauthorized");

    // Authenticated member WITHOUT admin.access → 403 forbidden at the guard.
    const memberSanction = await request(app)
      .post("/api/moderation/sanctions")
      .set("x-test-tier", "member")
      .send({ targetUserId: "u1" });
    assert.equal(memberSanction.status, 403);
    assert.equal(memberSanction.body.error.code, "forbidden");

    // Admin clears the guard → service runs; missing target user → domain 404.
    const adminSanction = await request(app)
      .post("/api/moderation/sanctions")
      .set("x-test-tier", "member")
      .set("x-test-admin", "1")
      .send({ targetUserId: "u1" });
    assert.equal(adminSanction.status, 404);
    assert.equal(adminSanction.body.error.code, "USER_NOT_FOUND");

    // Post moderation is likewise admin-gated: member → 403 (guard), admin → domain 404.
    const memberMod = await request(app)
      .post("/api/posts/p1/moderation")
      .set("x-test-tier", "member")
      .send({ action: "pin" });
    assert.equal(memberMod.status, 403);
    assert.equal(memberMod.body.error.code, "forbidden");

    const adminMod = await request(app)
      .post("/api/posts/p1/moderation")
      .set("x-test-tier", "member")
      .set("x-test-admin", "1")
      .send({ action: "pin" });
    assert.equal(adminMod.status, 404);
    assert.equal(adminMod.body.error.code, "POST_NOT_FOUND");
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
  const router = createCommunityRouter({ db: fakeDb as never });
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

describe("Community — 전체 QA · router ↔ route-table wiring parity", () => {
  it("registers exactly the method+path surface the route table declares", () => {
    const declared = new Set(
      communityRoutes.map((r) => `${r.method.toUpperCase()} ${r.path}`),
    );
    const registered = new Set(registeredRoutes().map((r) => r.key));
    assert.deepEqual(
      [...registered].sort(),
      [...declared].sort(),
      "http.ts router and routes.ts table describe different endpoints",
    );
  });

  it("guards writes/admin routes and leaves public reads ungated", () => {
    const byKey = new Map(registeredRoutes().map((r) => [r.key, r]));
    const declaredRole = new Map(
      communityRoutes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r.requiredRole]),
    );

    for (const [key, layer] of byKey) {
      const role = declaredRole.get(key);
      if (role === "public") {
        // Public reads: a single handler layer, no guard middleware.
        assert.equal(layer.handlerCount, 1, `${key} should be ungated (public read)`);
        assert.ok(layer.methods.includes("get"), `${key} declared public should be a GET`);
      } else {
        // member/admin: exactly one guard middleware + the handler.
        assert.equal(layer.handlerCount, 2, `${key} should carry a ${role} guard`);
      }
    }
  });

  it("every declared handler exists on the controller (no dangling route)", () => {
    const controller = createCommunityController(
      // A bare services object is enough: we only enumerate handler keys here.
      createCommunityServices({
        posts: new InMemoryPostRepository(),
        comments: new InMemoryCommentRepository(),
        reactions: new InMemoryReactionRepository(),
        moderation: new InMemoryModerationRepository(),
        views: new InMemoryPostViewRepository(),
        membership: new FakeMembershipReader(),
        clock: new MutableClock(),
        ids: new SequentialIdGenerator(),
      }),
    );
    for (const route of communityRoutes) {
      assert.equal(
        typeof (controller as Record<string, unknown>)[route.handler],
        "function",
        `route ${route.method} ${route.path} references missing handler ${route.handler}`,
      );
    }
  });
});
