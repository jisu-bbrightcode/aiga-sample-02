/**
 * Community BE — unit / contract tests.
 *
 * Implements the executable QA contract on BBR-1134 (be-qa-contract): post/
 * comment/reaction CRUD (P/C/R), 등급별 열람 일일 제한 boundaries (V), and 관리자
 * 모더레이션 권한 (M). Drives the framework-agnostic controller + in-memory ports
 * (no live HTTP), per the repo testing convention.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCommunityController,
  type HandlerRequest,
} from "../src/features/community/controller.js";
import { createCommunityServices } from "../src/features/community/service.js";
import { VIEW_WINDOW_MS } from "../src/features/community/view-limit-service.js";
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
  return { posts, moderation, services, controller, clock };
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

async function createPost(controller: Ctl, actor: Actor, over: Record<string, unknown> = {}) {
  return controller.createPost(
    req(actor, { body: { title: "Hello", body: "World", ...over } }),
  );
}

// --- §1 Post / Comment / Reaction CRUD --------------------------------------

describe("§1 Posts (P1–P7)", () => {
  it("P1: member creates a post -> 201, author=member", async () => {
    const { controller } = harness();
    const res = await createPost(controller, member);
    assert.equal(res.status, 201);
    const body = res.body as { authorId: string; author: { userId: string } };
    assert.equal(body.authorId, MEMBER);
    assert.equal(body.author.userId, MEMBER);
  });

  it("P2: guest creates a post -> 403 (canParticipateCommunity=false)", async () => {
    const { controller } = harness();
    const res = await createPost(controller, guest);
    assert.equal(res.status, 403);
    assert.equal((res.body as any).error.code, "PARTICIPATION_FORBIDDEN");
  });

  it("P3: empty/oversized title or body -> 400 validation", async () => {
    const { controller } = harness();
    assert.equal((await createPost(controller, member, { title: "" })).status, 400);
    assert.equal((await createPost(controller, member, { body: "" })).status, 400);
    const huge = "x".repeat(20_001);
    assert.equal((await createPost(controller, member, { body: huge })).status, 400);
  });

  it("P4: list posts is visibility-filtered by caller tier", async () => {
    const { controller } = harness();
    const created = await createPost(controller, member);
    const id = (created.body as { id: string }).id;
    await controller.moderatePost(req(admin, { params: { id }, body: { action: "remove" } }));

    const asMember = await controller.listPosts(req(member));
    assert.equal(asMember.status, 200);
    assert.equal((asMember.body as { total: number }).total, 0); // removed hidden

    const asAdmin = await controller.listPosts(req(admin));
    assert.equal((asAdmin.body as { total: number }).total, 1); // admin sees removed
  });

  it("P5: get post by id -> 200 (exists) / 404 (missing)", async () => {
    const { controller } = harness();
    const created = await createPost(controller, member);
    const id = (created.body as { id: string }).id;
    assert.equal((await controller.getPost(req(member, { params: { id } })).then((r) => r.status)), 200);
    assert.equal((await controller.getPost(req(member, { params: { id: "nope" } }))).status, 404);
  });

  it("P6: author updates own post -> 200; non-author non-admin -> 403", async () => {
    const { controller } = harness();
    const id = ((await createPost(controller, member)).body as { id: string }).id;
    const okRes = await controller.updatePost(req(member, { params: { id }, body: { title: "Edited" } }));
    assert.equal(okRes.status, 200);
    assert.equal((okRes.body as { title: string }).title, "Edited");
    const bad = await controller.updatePost(req(other, { params: { id }, body: { title: "X" } }));
    assert.equal(bad.status, 403);
  });

  it("P7: author deletes own post -> 200; non-author non-admin -> 403", async () => {
    const { controller } = harness();
    const id = ((await createPost(controller, member)).body as { id: string }).id;
    const bad = await controller.deletePost(req(other, { params: { id } }));
    assert.equal(bad.status, 403);
    const okRes = await controller.deletePost(req(member, { params: { id } }));
    assert.equal(okRes.status, 200);
    assert.equal((okRes.body as { status: string }).status, "deleted");
  });
});

describe("§1 Comments (C1–C4)", () => {
  async function seedPost(controller: Ctl) {
    return ((await createPost(controller, member)).body as { id: string }).id;
  }

  it("C1: member comments on a post -> 201", async () => {
    const { controller } = harness();
    const postId = await seedPost(controller);
    const res = await controller.createComment(
      req(member, { params: { postId }, body: { body: "nice" } }),
    );
    assert.equal(res.status, 201);
  });

  it("C2: guest comments -> 403", async () => {
    const { controller } = harness();
    const postId = await seedPost(controller);
    const res = await controller.createComment(
      req(guest, { params: { postId }, body: { body: "hi" } }),
    );
    assert.equal(res.status, 403);
  });

  it("C3: comment on missing post -> 404", async () => {
    const { controller } = harness();
    const res = await controller.createComment(
      req(member, { params: { postId: "nope" }, body: { body: "hi" } }),
    );
    assert.equal(res.status, 404);
  });

  it("C4: author edits/deletes own comment -> 200; other user -> 403", async () => {
    const { controller } = harness();
    const postId = await seedPost(controller);
    const cId = (
      (await controller.createComment(req(member, { params: { postId }, body: { body: "a" } })))
        .body as { id: string }
    ).id;

    const otherEdit = await controller.updateComment(req(other, { params: { id: cId }, body: { body: "z" } }));
    assert.equal(otherEdit.status, 403);
    const ownEdit = await controller.updateComment(req(member, { params: { id: cId }, body: { body: "b" } }));
    assert.equal(ownEdit.status, 200);
    const ownDelete = await controller.deleteComment(req(member, { params: { id: cId } }));
    assert.equal(ownDelete.status, 200);
  });
});

describe("§1 Reactions (R1–R4)", () => {
  async function seedPost(controller: Ctl) {
    return ((await createPost(controller, member)).body as { id: string }).id;
  }

  it("R1: member reacts -> 201; R2: duplicate is idempotent (no double count)", async () => {
    const { controller } = harness();
    const postId = await seedPost(controller);
    const first = await controller.react(req(member, { params: { postId }, body: { kind: "like" } }));
    assert.equal(first.status, 201);
    assert.equal((first.body as { reactionCount: number }).reactionCount, 1);

    const dup = await controller.react(req(member, { params: { postId }, body: { kind: "like" } }));
    assert.equal(dup.status, 200); // idempotent
    assert.equal((dup.body as { reactionCount: number }).reactionCount, 1);
  });

  it("R3: remove reaction -> 200, count decrements", async () => {
    const { controller } = harness();
    const postId = await seedPost(controller);
    await controller.react(req(member, { params: { postId }, body: { kind: "like" } }));
    const res = await controller.unreact(req(member, { params: { postId } }));
    assert.equal(res.status, 200);
    assert.equal((res.body as { reactionCount: number }).reactionCount, 0);
  });

  it("R4: guest reacts -> 403", async () => {
    const { controller } = harness();
    const postId = await seedPost(controller);
    const res = await controller.react(req(guest, { params: { postId }, body: { kind: "like" } }));
    assert.equal(res.status, 403);
  });
});

// --- §2 등급별 열람 제한 (daily view count) ----------------------------------

describe("§2 daily view limit (V1–V6)", () => {
  const GUEST_LIMIT = 10; // membership/policy.ts guest.dailyPostViewLimit

  it("V1/V2: Nth distinct view allowed, (N+1)th denied", async () => {
    const { services } = harness();
    const bucket = "ip:a";
    for (let i = 1; i <= GUEST_LIMIT; i++) {
      const r = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: `p${i}` });
      assert.equal(r.allowed, true, `view ${i} should be allowed`);
    }
    const overflow = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p11" });
    assert.equal(overflow.allowed, false);
    assert.equal(overflow.limit, GUEST_LIMIT);
  });

  it("V3: verified_doctor is unlimited", async () => {
    const { services } = harness();
    for (let i = 1; i <= GUEST_LIMIT + 5; i++) {
      const r = await services.viewLimiter.recordView({ bucketKey: `user:${DOCTOR}`, tier: "verified_doctor", postId: `p${i}` });
      assert.equal(r.allowed, true);
      assert.equal(r.limit, null);
    }
  });

  it("V4: window rollover (>24h) resets the count", async () => {
    const { services, clock } = harness();
    const bucket = "ip:b";
    for (let i = 1; i <= GUEST_LIMIT; i++) {
      await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: `p${i}` });
    }
    assert.equal(
      (await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p11" })).allowed,
      false,
    );
    clock.advance(VIEW_WINDOW_MS + 1000); // roll past the window
    const after = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p12" });
    assert.equal(after.allowed, true);
  });

  it("V5: re-view of an already-counted post is idempotent (not double-counted)", async () => {
    const { services } = harness();
    const bucket = "ip:c";
    const first = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p1" });
    assert.equal(first.allowed, true);
    const again = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p1" });
    assert.equal(again.allowed, true);
    assert.equal(again.alreadyCounted, true);
    // Only one distinct post consumed: a fresh distinct post is still allowed.
    const fresh = await services.viewLimiter.recordView({ bucketKey: bucket, tier: "guest", postId: "p2" });
    assert.equal(fresh.used, 1); // exactly one distinct post counted before p2
  });

  it("V6: guest buckets are independent per IP", async () => {
    const { services } = harness();
    for (let i = 1; i <= GUEST_LIMIT; i++) {
      await services.viewLimiter.recordView({ bucketKey: "ip:x", tier: "guest", postId: `p${i}` });
    }
    assert.equal(
      (await services.viewLimiter.recordView({ bucketKey: "ip:x", tier: "guest", postId: "p11" })).allowed,
      false,
    );
    // A different IP has its own fresh bucket.
    assert.equal(
      (await services.viewLimiter.recordView({ bucketKey: "ip:y", tier: "guest", postId: "p1" })).allowed,
      true,
    );
  });

  it("controller getPost surfaces 429 POST_VIEW_DAILY_LIMIT_EXCEEDED at the cap", async () => {
    const { controller } = harness();
    const ids: string[] = [];
    for (let i = 0; i < GUEST_LIMIT + 1; i++) {
      ids.push(((await createPost(controller, member)).body as { id: string }).id);
    }
    for (let i = 0; i < GUEST_LIMIT; i++) {
      const r = await controller.getPost(req(guest, { params: { id: ids[i]! } }));
      assert.equal(r.status, 200, `view ${i + 1} allowed`);
    }
    const denied = await controller.getPost(req(guest, { params: { id: ids[GUEST_LIMIT]! } }));
    assert.equal(denied.status, 429);
    assert.equal((denied.body as any).error.code, "POST_VIEW_DAILY_LIMIT_EXCEEDED");
  });
});

// --- §3 관리자 모더레이션 권한 (M1–M6) --------------------------------------

describe("§3 admin moderation (M1–M6)", () => {
  async function seedPost(controller: Ctl) {
    return ((await createPost(controller, member)).body as { id: string }).id;
  }

  it("M1: admin pins/locks/removes a post -> 200", async () => {
    const { controller } = harness();
    const id = await seedPost(controller);
    for (const action of ["pin", "lock", "remove"]) {
      const r = await controller.moderatePost(req(admin, { params: { id }, body: { action } }));
      assert.equal(r.status, 200, `${action} should succeed`);
    }
  });

  it("M2: non-admin member attempts pin/lock/remove -> 403", async () => {
    const { controller } = harness();
    const id = await seedPost(controller);
    const r = await controller.moderatePost(req(member, { params: { id }, body: { action: "pin" } }));
    assert.equal(r.status, 403);
    assert.equal((r.body as any).error.code, "ADMIN_REQUIRED");
  });

  it("M3: admin sanction / keyword-filter / content-moderation -> 200", async () => {
    const { controller } = harness();
    const id = await seedPost(controller);
    const s = await controller.sanction(req(admin, { body: { targetUserId: TARGET, kind: "mute" } }));
    assert.equal(s.status, 200);
    const k = await controller.keywordFilter(req(admin, { body: { keyword: "spam" } }));
    assert.equal(k.status, 200);
    const c = await controller.contentModeration(
      req(admin, { body: { targetType: "post", targetId: id, action: "hide" } }),
    );
    assert.equal(c.status, 200);
  });

  it("M4: non-admin attempts moderation action -> 403", async () => {
    const { controller } = harness();
    const s = await controller.sanction(req(member, { body: { targetUserId: TARGET } }));
    assert.equal(s.status, 403);
    const k = await controller.keywordFilter(req(other, { body: { keyword: "x" } }));
    assert.equal(k.status, 403);
  });

  it("M5: moderation action on a missing target -> 404", async () => {
    const { controller } = harness();
    const s = await controller.sanction(req(admin, { body: { targetUserId: "ghost" } }));
    assert.equal(s.status, 404);
    const c = await controller.contentModeration(
      req(admin, { body: { targetType: "post", targetId: "ghost", action: "hide" } }),
    );
    assert.equal(c.status, 404);
  });

  it("M6: audit trail records the acting admin", async () => {
    const { controller, moderation } = harness();
    const id = await seedPost(controller);
    const res = await controller.moderatePost(req(admin, { params: { id }, body: { action: "pin", reason: "featured" } }));
    const audit = (res.body as { audit: { actorId: string; action: string; targetId: string } }).audit;
    assert.equal(audit.actorId, ADMIN);
    assert.equal(audit.action, "pin");
    assert.equal(audit.targetId, id);
    // And it is persisted in the moderation log.
    const log = moderation.all();
    assert.equal(log.length, 1);
    assert.equal(log[0]!.actorId, ADMIN);
  });
});
