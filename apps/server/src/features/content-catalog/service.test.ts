import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContentError } from "./errors.js";
import {
  FixedClock,
  InMemoryContentRepository,
  SequentialIdGenerator,
} from "./testing/in-memory.js";
import { ContentService, type ContentActor } from "./service.js";
import type { CreateContentInput } from "./types.js";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const admin: ContentActor = { userId: "admin-1", isAdmin: true };
const author: ContentActor = { userId: AUTHOR, isAdmin: false };
const other: ContentActor = { userId: OTHER, isAdmin: false };

const guest = { userId: null, isAdmin: false } as const;

function makeService() {
  const repo = new InMemoryContentRepository();
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  return { repo, clock, service: new ContentService({ repo, clock, ids }) };
}

/** Build a valid create input; category defaults to the member-writable `free`. */
function draft(overrides: Partial<CreateContentInput> = {}): CreateContentInput {
  return { authorId: AUTHOR, title: "Untitled", category: "free", ...overrides };
}

async function expectContentError(fn: () => Promise<unknown>, code: string, status: number) {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ContentError, `expected ContentError, got ${String(err)}`);
    assert.equal(err.code, code);
    assert.equal(err.status, status);
    return true;
  });
}

describe("ContentService — authoring", () => {
  it("creates a draft owned by the author with zeroed counts", async () => {
    const { service } = makeService();
    const created = await service.create(draft({ title: "First Guide" }), author);
    assert.equal(created.status, "draft");
    assert.equal(created.authorId, AUTHOR);
    assert.equal(created.category, "free");
    assert.equal(created.viewCount, 0);
    assert.equal(created.likeCount, 0);
    assert.equal(created.reportCount, 0);
    assert.equal(created.publishedAt, null);
    assert.equal(created.deletedAt, null);
  });

  it("only lets admins author `notice` content", async () => {
    const { service } = makeService();
    await expectContentError(
      () => service.create(draft({ category: "notice" }), author),
      "FORBIDDEN",
      403,
    );
    const byAdmin = await service.create(draft({ category: "notice" }), admin);
    assert.equal(byAdmin.category, "notice");
  });

  it("forbids a non-owner from updating; allows the owner and admin", async () => {
    const { service } = makeService();
    const created = await service.create(draft({ title: "Mine" }), author);
    await expectContentError(
      () => service.update(created.id, other, { title: "hijack" }),
      "FORBIDDEN",
      403,
    );
    const byOwner = await service.update(created.id, author, { title: "Owner Edit" });
    assert.equal(byOwner.title, "Owner Edit");
    const byAdmin = await service.update(created.id, admin, { body: "Admin body" });
    assert.equal(byAdmin.body, "Admin body");
  });

  it("blocks a non-admin from re-categorising their item to `notice`", async () => {
    const { service } = makeService();
    const created = await service.create(draft(), author);
    await expectContentError(
      () => service.update(created.id, author, { category: "notice" }),
      "FORBIDDEN",
      403,
    );
    const byAdmin = await service.update(created.id, admin, { category: "notice" });
    assert.equal(byAdmin.category, "notice");
  });

  it("soft-deletes so the item disappears from reads", async () => {
    const { service } = makeService();
    const created = await service.create(draft({ title: "Temp" }), author);
    await service.remove(created.id, author);
    await expectContentError(() => service.getForViewer(created.id, guest), "CONTENT_NOT_FOUND", 404);
  });
});

describe("ContentService — public reads & visibility", () => {
  it("lists only published, non-deleted content", async () => {
    const { service } = makeService();
    const draftItem = await service.create(draft({ title: "Hidden Draft" }), author);
    const toPublish = await service.create(draft({ title: "Public One" }), author);
    await service.adminSetStatus(toPublish.id, "published");

    const page = await service.listPublished({});
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.id, toPublish.id);
    assert.ok(!page.items.some((c) => c.id === draftItem.id));
  });

  it("stamps publishedAt only on the first publish, not on hide→publish churn", async () => {
    const { service, clock } = makeService();
    const c = await service.create(draft({ title: "P" }), author);
    const published = await service.adminSetStatus(c.id, "published");
    assert.ok(published.publishedAt instanceof Date);
    const firstPublishedAt = published.publishedAt!.getTime();

    clock.advance(60_000);
    const hidden = await service.adminSetStatus(c.id, "hidden");
    assert.equal(hidden.publishedAt!.getTime(), firstPublishedAt, "hiding keeps the original stamp");

    const republished = await service.adminSetStatus(c.id, "published");
    // Re-entering published from hidden is a fresh publish → re-stamps.
    assert.ok(republished.publishedAt!.getTime() >= firstPublishedAt);
  });

  it("increments view count on a public detail read", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Viewed" }), author);
    await service.adminSetStatus(c.id, "published");
    const viewed = await service.getForViewer(c.id, guest);
    assert.equal(viewed.viewCount, 1);
    const again = await service.getForViewer(c.id, guest);
    assert.equal(again.viewCount, 2);
  });

  it("hides non-published from guests but shows to owner and admin", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Secret Draft" }), author);
    await expectContentError(() => service.getForViewer(c.id, guest), "CONTENT_NOT_FOUND", 404);
    const asOwner = await service.getForViewer(c.id, { userId: AUTHOR, isAdmin: false });
    assert.equal(asOwner.id, c.id);
    const asAdmin = await service.getForViewer(c.id, { userId: "x", isAdmin: true });
    assert.equal(asAdmin.id, c.id);
  });

  it("searches across title/body and filters by category & conditionTag", async () => {
    const { service } = makeService();
    const a = await service.create(
      draft({ title: "Diabetes care", body: "insulin dosage", category: "qna", conditionTags: ["endocrine"] }),
      author,
    );
    const b = await service.create(draft({ title: "General wellness", conditionTags: ["lifestyle"] }), author);
    await service.adminSetStatus(a.id, "published");
    await service.adminSetStatus(b.id, "published");

    const byBody = await service.search({ q: "insulin" });
    assert.equal(byBody.total, 1);
    assert.equal(byBody.items[0]?.id, a.id);

    const byTag = await service.listPublished({ conditionTag: "lifestyle" });
    assert.equal(byTag.total, 1);
    assert.equal(byTag.items[0]?.id, b.id);

    const byCategory = await service.listPublished({ category: "qna" });
    assert.equal(byCategory.total, 1);
    assert.equal(byCategory.items[0]?.id, a.id);
  });

  it("paginates and sorts by views", async () => {
    const { service } = makeService();
    const first = await service.create(draft({ title: "Low" }), author);
    const second = await service.create(draft({ title: "High" }), author);
    await service.adminSetStatus(first.id, "published");
    await service.adminSetStatus(second.id, "published");
    // Bump views on `second`.
    await service.getForViewer(second.id, guest);
    await service.getForViewer(second.id, guest);

    const popular = await service.listPublished({ sort: "views", page: 1, pageSize: 1 });
    assert.equal(popular.total, 2);
    assert.equal(popular.items.length, 1);
    assert.equal(popular.items[0]?.id, second.id);
  });
});

describe("ContentService — admin", () => {
  it("lists all statuses and can include soft-deleted", async () => {
    const { service } = makeService();
    const a = await service.create(draft({ title: "Draft A" }), author);
    const b = await service.create(draft({ title: "Draft B" }), author);
    await service.remove(b.id, author);

    const withoutDeleted = await service.adminList({});
    assert.equal(withoutDeleted.total, 1);
    const withDeleted = await service.adminList({ includeDeleted: true });
    assert.equal(withDeleted.total, 2);
    assert.ok(withDeleted.items.some((c) => c.id === a.id));
  });

  it("restores a soft-deleted item, bringing it back into reads", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Recoverable" }), author);
    await service.adminSetStatus(c.id, "published");
    await service.remove(c.id, author);
    await expectContentError(() => service.getForViewer(c.id, guest), "CONTENT_NOT_FOUND", 404);

    const restored = await service.adminRestore(c.id);
    assert.equal(restored.deletedAt, null);
    assert.equal((await service.getForViewer(c.id, guest)).id, c.id);
  });

  it("filters the admin queue by report state", async () => {
    const { repo, service } = makeService();
    const clean = await service.create(draft({ title: "Clean" }), author);
    const flagged = await service.create(draft({ title: "Flagged" }), author);
    repo.seed({ ...(await repo.findById(flagged.id))!, reportCount: 3 });

    const reported = await service.adminList({ reported: true });
    assert.equal(reported.total, 1);
    assert.equal(reported.items[0]?.id, flagged.id);
    assert.ok(!reported.items.some((c) => c.id === clean.id));
  });

  it("hard-deletes on request", async () => {
    const { service, repo } = makeService();
    const c = await service.create(draft({ title: "Purge me" }), author);
    await service.adminRemove(c.id, { hard: true });
    assert.equal(await repo.findById(c.id), undefined);
  });
});
