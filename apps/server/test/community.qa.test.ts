/**
 * BE QA — 커뮤니티 (Community & Posts) — BBR-1134
 *
 * QA hardening suite that complements the dev/contract tests in
 * `community.test.ts`. Where that suite pins the happy paths (P/C/R/V/M), this
 * one targets the edge cases, boundaries, and authorization corners the
 * happy-path suite does not exercise, organized by the three QA deliverables:
 *
 *  1. 게시글/댓글/반응 CRUD 계약 (§A–§C) — CRUD contract completeness / edges.
 *  2. 등급별 열람 제한 일일 카운트 경계 (§D) — daily view-limit boundaries.
 *  3. 관리자 모더레이션 권한 (§E)         — admin moderation permission matrix.
 *
 * Drives the framework-agnostic controller + in-memory ports (no live HTTP),
 * per the repo testing convention. Two behaviours this suite deliberately pins
 * (and flags for product, see NOTE markers):
 *   - Locked posts reject edits/comments but NOT reactions.
 *   - The /moderation/** surface returns 401 for guests (userId gate) but 403
 *     ADMIN_REQUIRED for authenticated non-admins; post/comment moderation
 *     returns 403 for everyone including guests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCommunityController,
  type HandlerRequest,
} from "../src/features/community/controller.js";
import { createCommunityServices } from "../src/features/community/service.js";
import { VIEW_WINDOW_MS } from "../src/features/community/view-limit-service.js";
import { viewBucketKey } from "../src/features/community/guards.js";
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

const MEMBER = "member-1";
const OTHER = "member-2";
const DOCTOR = "doctor-1";
const ADMIN = "admin-1";
const TARGET = "target-1";

function harness() {
  const posts = new InMemoryPostRepository();
  const comments = new InMemoryCommentRepository();
  const reactions = new InMemoryReactionRepository();
  const moderation = new InMemoryModerationRepository();
  const views = new InMemoryPostViewRepository();
  const membership = new FakeMembershipReader([
    makeBadge(MEMBER),
    makeBadge(OTHER),
    makeBadge(ADMIN),
    makeBadge(TARGET),
    makeDoctorBadge(DOCTOR),
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
  const controller = createCommunityController(services);
  return { posts, comments, moderation, services, controller, clock };
}

const guest: Actor = { userId: null, tier: "guest", isAdmin: false, ip: "10.0.0.1" };
const member: Actor = { userId: MEMBER, tier: "member", isAdmin: false, ip: null };
const other: Actor = { userId: OTHER, tier: "member", isAdmin: false, ip: null };
const doctor: Actor = { userId: DOCTOR, tier: "verified_doctor", isAdmin: false, ip: null };
const admin: Actor = { userId: ADMIN, tier: "member", isAdmin: true, ip: null };

const req = (
  actor: Actor,
  parts: Partial<Pick<HandlerRequest, "params" | "query" | "body">> = {},
): HandlerRequest => ({
  actor,
  params: parts.params ?? {},
  query: parts.query ?? {},
  body: parts.body ?? {},
});

type Ctl = ReturnType<typeof createCommunityController>;

const code = (res: { body: unknown }): string =>
  (res.body as { error?: { code?: string } }).error?.code ?? "";

async function createPost(controller: Ctl, actor: Actor, over: Record<string, unknown> = {}) {
  return controller.createPost(
    req(actor, { body: { title: "Hello", body: "World", ...over } }),
  );
}

async function newPostId(controller: Ctl, actor: Actor = member, over: Record<string, unknown> = {}) {
  return ((await createPost(controller, actor, over)).body as { id: string }).id;
}

// ===========================================================================
// §A 게시글 CRUD 계약 — edges & boundaries
// ===========================================================================

describe("§A Posts — CRUD contract hardening", () => {
  it("A1: whitespace-only title/body is rejected (trim then min-length) -> 400", async () => {
    const { controller } = harness();
    assert.equal((await createPost(controller, member, { title: "   " })).status, 400);
    assert.equal((await createPost(controller, member, { body: "\n\t  " })).status, 400);
  });

  it("A2: title/body accepted at exact max, rejected one over", async () => {
    const { controller } = harness();
    const title200 = "t".repeat(200);
    const body20k = "b".repeat(20_000);
    const okRes = await createPost(controller, member, { title: title200, body: body20k });
    assert.equal(okRes.status, 201);
    assert.equal((await createPost(controller, member, { title: "t".repeat(201) })).status, 400);
    assert.equal((await createPost(controller, member, { body: "b".repeat(20_001) })).status, 400);
  });

  it("A3: blank category collapses to null; a real category is preserved & trimmed", async () => {
    const { controller } = harness();
    const blank = (await createPost(controller, member, { category: "  " })).body as {
      category: string | null;
    };
    assert.equal(blank.category, null);
    const withCat = (await createPost(controller, member, { category: " qna " })).body as {
      category: string | null;
    };
    assert.equal(withCat.category, "qna");
  });

  it("A4: PATCH with no updatable fields -> 400 (at-least-one-field rule)", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    const res = await controller.updatePost(req(member, { params: { id }, body: {} }));
    assert.equal(res.status, 400);
  });

  it("A5: locked post rejects non-admin author edit (403 POST_LOCKED) but admin may edit", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id }, body: { action: "lock" } }));

    const authorEdit = await controller.updatePost(
      req(member, { params: { id }, body: { title: "Nope" } }),
    );
    assert.equal(authorEdit.status, 403);
    assert.equal(code(authorEdit), "POST_LOCKED");

    const adminEdit = await controller.updatePost(
      req(admin, { params: { id }, body: { title: "Admin edit" } }),
    );
    assert.equal(adminEdit.status, 200);
    assert.equal((adminEdit.body as { title: string }).title, "Admin edit");
  });

  it("A6: author edit/delete of an admin-removed post -> 404 (not active)", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id }, body: { action: "remove" } }));

    assert.equal(
      (await controller.updatePost(req(member, { params: { id }, body: { title: "x" } }))).status,
      404,
    );
    assert.equal((await controller.deletePost(req(member, { params: { id } }))).status, 404);
  });

  it("A7: deleting an already-deleted post -> 404 (idempotency guard)", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    assert.equal((await controller.deletePost(req(member, { params: { id } }))).status, 200);
    assert.equal((await controller.deletePost(req(member, { params: { id } }))).status, 404);
  });

  it("A8: removed post is 404 for non-admin GET, 200 for admin, and restore re-exposes it", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id }, body: { action: "remove" } }));

    assert.equal((await controller.getPost(req(member, { params: { id } }))).status, 404);
    assert.equal((await controller.getPost(req(admin, { params: { id } }))).status, 200);

    await controller.moderatePost(req(admin, { params: { id }, body: { action: "restore" } }));
    assert.equal((await controller.getPost(req(member, { params: { id } }))).status, 200);
  });

  it("A9: list floats pinned posts first regardless of recency", async () => {
    const { controller } = harness();
    const first = await newPostId(controller);
    await newPostId(controller); // second (more recent)
    await controller.moderatePost(req(admin, { params: { id: first }, body: { action: "pin" } }));

    const page = (await controller.listPosts(req(member))).body as {
      items: Array<{ id: string; pinned: boolean }>;
      total: number;
    };
    assert.equal(page.total, 2);
    assert.equal(page.items[0]!.id, first);
    assert.equal(page.items[0]!.pinned, true);
  });

  it("A10: list is filtered by category", async () => {
    const { controller } = harness();
    await newPostId(controller, member, { category: "qna" });
    await newPostId(controller, member, { category: "free" });
    const page = (await controller.listPosts(req(member, { query: { category: "qna" } }))).body as {
      total: number;
      items: Array<{ category: string | null }>;
    };
    assert.equal(page.total, 1);
    assert.equal(page.items[0]!.category, "qna");
  });

  it("A11: list rejects out-of-range pagination -> 400", async () => {
    const { controller } = harness();
    assert.equal((await controller.listPosts(req(member, { query: { limit: "0" } }))).status, 400);
    assert.equal((await controller.listPosts(req(member, { query: { limit: "101" } }))).status, 400);
    assert.equal((await controller.listPosts(req(member, { query: { offset: "-1" } }))).status, 400);
  });
});

// ===========================================================================
// §B 댓글 CRUD 계약 — edges & boundaries
// ===========================================================================

describe("§B Comments — CRUD contract hardening", () => {
  it("B1: comment on a locked post -> non-admin 403 POST_LOCKED, admin allowed", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id: postId }, body: { action: "lock" } }));

    const memberComment = await controller.createComment(
      req(member, { params: { postId }, body: { body: "hi" } }),
    );
    assert.equal(memberComment.status, 403);
    assert.equal(code(memberComment), "POST_LOCKED");

    const adminComment = await controller.createComment(
      req(admin, { params: { postId }, body: { body: "admin can" } }),
    );
    assert.equal(adminComment.status, 201);
  });

  it("B2: comment on a removed post -> 404", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id: postId }, body: { action: "remove" } }));
    const res = await controller.createComment(
      req(member, { params: { postId }, body: { body: "hi" } }),
    );
    assert.equal(res.status, 404);
  });

  it("B3: editing a moderation-removed comment -> 404", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const cId = (
      (await controller.createComment(req(member, { params: { postId }, body: { body: "a" } })))
        .body as { id: string }
    ).id;
    await controller.moderateComment(req(admin, { params: { id: cId }, body: { action: "remove" } }));
    const res = await controller.updateComment(req(member, { params: { id: cId }, body: { body: "b" } }));
    assert.equal(res.status, 404);
  });

  it("B4: comment body accepted at exact max (4000), rejected one over", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const okRes = await controller.createComment(
      req(member, { params: { postId }, body: { body: "c".repeat(4_000) } }),
    );
    assert.equal(okRes.status, 201);
    const tooLong = await controller.createComment(
      req(member, { params: { postId }, body: { body: "c".repeat(4_001) } }),
    );
    assert.equal(tooLong.status, 400);
  });

  it("B5: listComments hides removed comments and floats sticky first", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const mk = async (body: string) =>
      (
        (await controller.createComment(req(member, { params: { postId }, body: { body } })))
          .body as { id: string }
      ).id;
    await mk("first");
    const c2 = await mk("second");
    const c3 = await mk("third");
    await controller.moderateComment(req(admin, { params: { id: c2 }, body: { action: "sticky" } }));
    await controller.moderateComment(req(admin, { params: { id: c3 }, body: { action: "remove" } }));

    const items = (await controller.listComments(req(member, { params: { postId } }))).body as {
      items: Array<{ id: string; sticky: boolean }>;
    };
    assert.equal(items.items.length, 2); // removed hidden
    assert.equal(items.items[0]!.id, c2); // sticky first
    assert.equal(items.items[0]!.sticky, true);
  });
});

// ===========================================================================
// §C 반응 CRUD 계약 — idempotency & edges
// ===========================================================================

describe("§C Reactions — contract hardening", () => {
  it("C1: switching reaction kind updates in place (count stays 1, kind changes)", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const first = await controller.react(req(member, { params: { postId }, body: { kind: "upvote" } }));
    assert.equal(first.status, 201);
    const switched = await controller.react(
      req(member, { params: { postId }, body: { kind: "downvote" } }),
    );
    const body = switched.body as { kind: string; reactionCount: number; changed: boolean };
    assert.equal(body.kind, "downvote");
    assert.equal(body.reactionCount, 1);
    assert.equal(body.changed, true);
  });

  it("C2: removing a non-existent reaction is idempotent (changed=false, count 0)", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const res = await controller.unreact(req(member, { params: { postId } }));
    assert.equal(res.status, 200);
    const body = res.body as { changed: boolean; reactionCount: number };
    assert.equal(body.changed, false);
    assert.equal(body.reactionCount, 0);
  });

  it("C3: reactions from distinct users accumulate the count", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    await controller.react(req(member, { params: { postId }, body: { kind: "like" } }));
    const res = await controller.react(req(other, { params: { postId }, body: { kind: "like" } }));
    assert.equal((res.body as { reactionCount: number }).reactionCount, 2);
  });

  it("C4: reacting on a removed post -> 404", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id: postId }, body: { action: "remove" } }));
    const res = await controller.react(req(member, { params: { postId }, body: { kind: "like" } }));
    assert.equal(res.status, 404);
  });

  it("C5: invalid reaction kind -> 400", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const res = await controller.react(req(member, { params: { postId }, body: { kind: "wow" } }));
    assert.equal(res.status, 400);
  });

  it("C6: NOTE(product) — reactions are allowed on a LOCKED post (locked freezes edits/comments only)", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    await controller.moderatePost(req(admin, { params: { id: postId }, body: { action: "lock" } }));
    const res = await controller.react(req(member, { params: { postId }, body: { kind: "like" } }));
    // Current, intended-per-implementation behaviour. If product wants locked
    // posts fully frozen, reaction-service must also reject `locked`.
    assert.equal(res.status, 201);
    assert.equal((res.body as { reactionCount: number }).reactionCount, 1);
  });
});

// ===========================================================================
// §D 등급별 열람 제한 (일일 카운트) — boundary tests
// ===========================================================================

describe("§D Daily view limit — boundaries", () => {
  it("D1: member boundary — 50th distinct view allowed, 51st denied", async () => {
    const { services } = harness();
    const bucket = `user:${MEMBER}`;
    for (let i = 1; i <= 50; i++) {
      const r = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "member", postId: `p${i}` });
      assert.equal(r.allowed, true, `member view ${i} should be allowed`);
    }
    const overflow = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "member", postId: "p51" });
    assert.equal(overflow.allowed, false);
    assert.equal(overflow.limit, 50);
  });

  it("D2: window boundary is exact — still denied at +WINDOW, resets at +WINDOW+1ms", async () => {
    const { services, clock } = harness();
    const bucket = "ip:edge";
    for (let i = 1; i <= 10; i++) {
      await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: `p${i}` });
    }
    // Exactly one window later: the oldest views are still within [now-WINDOW, now].
    clock.advance(VIEW_WINDOW_MS);
    assert.equal(
      (await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p11" })).allowed,
      false,
      "at exactly +WINDOW the window is inclusive → still at cap",
    );
    // One millisecond past the window: oldest views expire → capacity frees up.
    clock.advance(1);
    assert.equal(
      (await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p12" })).allowed,
      true,
      "at +WINDOW+1ms the oldest view falls out of the window",
    );
  });

  it("D3: authenticated callers bucket by user id, not IP (bucket key is stable across IPs)", async () => {
    // Two requests from the same member but different client IPs share one bucket.
    const a: Actor = { ...member, ip: "1.1.1.1" };
    const b: Actor = { ...member, ip: "2.2.2.2" };
    assert.equal(viewBucketKey(a), `user:${MEMBER}`);
    assert.equal(viewBucketKey(b), `user:${MEMBER}`);
    // Guests fall back to per-IP buckets.
    assert.equal(viewBucketKey(guest), "ip:10.0.0.1");
    assert.equal(viewBucketKey({ ...guest, ip: null }), "ip:unknown");
  });

  it("D4: re-GET of the same post never consumes extra quota (controller idempotency)", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    // View the same post 15 times as a guest (guest cap is 10 distinct posts).
    for (let i = 0; i < 15; i++) {
      const r = await controller.getPost(req(guest, { params: { id } }));
      assert.equal(r.status, 200, `re-view ${i + 1} should stay allowed`);
    }
  });

  it("D5: verified_doctor is unlimited via the controller (well past the member cap)", async () => {
    const { controller } = harness();
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) ids.push(await newPostId(controller));
    for (const id of ids) {
      const r = await controller.getPost(req(doctor, { params: { id } }));
      assert.equal(r.status, 200);
    }
  });
});

// ===========================================================================
// §E 관리자 모더레이션 권한 — permission matrix & audit
// ===========================================================================

describe("§E Admin moderation — permission matrix & audit", () => {
  it("E1: guest attempts post moderation -> 403 ADMIN_REQUIRED", async () => {
    const { controller } = harness();
    const id = await newPostId(controller);
    const res = await controller.moderatePost(req(guest, { params: { id }, body: { action: "pin" } }));
    assert.equal(res.status, 403);
    assert.equal(code(res), "ADMIN_REQUIRED");
  });

  it("E2: comment moderation is admin-only — non-admin -> 403, missing comment -> 404", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const cId = (
      (await controller.createComment(req(member, { params: { postId }, body: { body: "a" } })))
        .body as { id: string }
    ).id;
    const denied = await controller.moderateComment(
      req(member, { params: { id: cId }, body: { action: "sticky" } }),
    );
    assert.equal(denied.status, 403);
    assert.equal(code(denied), "ADMIN_REQUIRED");

    const missing = await controller.moderateComment(
      req(admin, { params: { id: "ghost" }, body: { action: "sticky" } }),
    );
    assert.equal(missing.status, 404);
  });

  it("E3: comment moderation audit action codes (sticky/distinguish/remove)", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const mk = async () =>
      (
        (await controller.createComment(req(member, { params: { postId }, body: { body: "x" } })))
          .body as { id: string }
      ).id;
    const expectAction = async (id: string, action: string, expected: string) => {
      const res = await controller.moderateComment(req(admin, { params: { id }, body: { action } }));
      assert.equal(res.status, 200);
      assert.equal((res.body as { audit: { action: string } }).audit.action, expected);
    };
    await expectAction(await mk(), "sticky", "comment_sticky");
    await expectAction(await mk(), "distinguish", "comment_distinguish");
    await expectAction(await mk(), "remove", "remove");
  });

  it("E4: /moderation/** surface — guest -> 401 (userId gate), member -> 403 ADMIN_REQUIRED", async () => {
    const { controller } = harness();
    // NOTE: the moderation surface gates on an authenticated userId first, so a
    // guest gets 401 (not 403) — a deliberate distinction from post/comment
    // moderation which returns 403 for guests too.
    assert.equal(
      (await controller.sanction(req(guest, { body: { targetUserId: TARGET } }))).status,
      401,
    );
    assert.equal(
      (await controller.keywordFilter(req(guest, { body: { keyword: "spam" } }))).status,
      401,
    );
    assert.equal(
      (await controller.contentModeration(
        req(guest, { body: { targetType: "post", targetId: "x", action: "hide" } }),
      )).status,
      401,
    );

    const memberSanction = await controller.sanction(req(member, { body: { targetUserId: TARGET } }));
    assert.equal(memberSanction.status, 403);
    assert.equal(code(memberSanction), "ADMIN_REQUIRED");
  });

  it("E5: content-moderation targets comments too; missing comment -> 404", async () => {
    const { controller } = harness();
    const postId = await newPostId(controller);
    const cId = (
      (await controller.createComment(req(member, { params: { postId }, body: { body: "a" } })))
        .body as { id: string }
    ).id;
    const ok = await controller.contentModeration(
      req(admin, { body: { targetType: "comment", targetId: cId, action: "hide" } }),
    );
    assert.equal(ok.status, 200);
    assert.equal((ok.body as { audit: { targetType: string } }).audit.targetType, "comment");

    const missing = await controller.contentModeration(
      req(admin, { body: { targetType: "comment", targetId: "ghost", action: "hide" } }),
    );
    assert.equal(missing.status, 404);
  });

  it("E6: crosspost records crosspostOf in the audit metadata", async () => {
    const { controller } = harness();
    const source = await newPostId(controller);
    const target = await newPostId(controller);
    const res = await controller.moderatePost(
      req(admin, { params: { id: target }, body: { action: "crosspost", crosspostOf: source } }),
    );
    assert.equal(res.status, 200);
    const audit = (res.body as { audit: { action: string; metadata: { crosspostOf?: string } } }).audit;
    assert.equal(audit.action, "crosspost");
    assert.equal(audit.metadata.crosspostOf, source);
    assert.equal((res.body as { post: { crosspostOf: string | null } }).post.crosspostOf, source);
  });

  it("E7: sanction & keyword-filter write audit entries attributed to the acting admin", async () => {
    const { controller, moderation, services } = harness();
    await controller.sanction(req(admin, { body: { targetUserId: TARGET, kind: "mute", reason: "spam" } }));
    await controller.keywordFilter(req(admin, { body: { keyword: "badword" } }));

    const log = moderation.all();
    assert.equal(log.length, 2);
    assert.ok(log.every((e) => e.actorId === ADMIN));

    const sanction = log.find((e) => e.action === "sanction")!;
    assert.equal(sanction.targetType, "user");
    assert.equal(sanction.targetId, TARGET);
    assert.equal((sanction.metadata as { kind?: string }).kind, "mute");

    // history() surfaces the trail for a specific target.
    const trail = await services.moderation.history("keyword", "badword");
    assert.equal(trail.length, 1);
    assert.equal(trail[0]!.action, "keyword_filter");
  });

  it("E8: sanctioning a non-existent user -> 404 USER_NOT_FOUND", async () => {
    const { controller } = harness();
    const res = await controller.sanction(req(admin, { body: { targetUserId: "ghost" } }));
    assert.equal(res.status, 404);
    assert.equal(code(res), "USER_NOT_FOUND");
  });
});
