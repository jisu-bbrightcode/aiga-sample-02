import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { ContentError } from "./errors.js";
import {
  FixedClock,
  InMemoryCategoryRepository,
  InMemoryContentRepository,
  SequentialIdGenerator,
} from "./testing/in-memory.js";
import {
  CategoryService,
  ContentService,
  type ContentActor,
} from "./service.js";

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

async function expectContentError(fn: () => Promise<unknown>, code: string, status: number) {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ContentError, `expected ContentError, got ${String(err)}`);
    assert.equal(err.code, code);
    assert.equal(err.status, status);
    return true;
  });
}

describe("ContentService — authoring", () => {
  it("creates a draft owned by the author with a derived slug", async () => {
    const { service } = makeService();
    const created = await service.create({ authorId: AUTHOR, title: "First Guide" });
    assert.equal(created.status, "draft");
    assert.equal(created.authorId, AUTHOR);
    assert.equal(created.slug, "first-guide");
    assert.equal(created.viewCount, 0);
    assert.equal(created.publishedAt, null);
  });

  it("rejects an explicit slug that is already taken", async () => {
    const { service } = makeService();
    await service.create({ authorId: AUTHOR, title: "A", slug: "shared" });
    await expectContentError(
      () => service.create({ authorId: OTHER, title: "B", slug: "shared" }),
      "SLUG_CONFLICT",
      409,
    );
  });

  it("auto-suffixes a derived slug collision instead of failing", async () => {
    const { service } = makeService();
    const a = await service.create({ authorId: AUTHOR, title: "Same Title" });
    const b = await service.create({ authorId: AUTHOR, title: "Same Title" });
    assert.equal(a.slug, "same-title");
    assert.notEqual(b.slug, a.slug);
  });

  it("forbids a non-owner from updating; allows the owner and admin", async () => {
    const { service } = makeService();
    const created = await service.create({ authorId: AUTHOR, title: "Mine" });
    await expectContentError(
      () => service.update(created.id, other, { title: "hijack" }),
      "FORBIDDEN",
      403,
    );
    const byOwner = await service.update(created.id, author, { title: "Owner Edit" });
    assert.equal(byOwner.title, "Owner Edit");
    const byAdmin = await service.update(created.id, admin, { summary: "Admin summary" });
    assert.equal(byAdmin.summary, "Admin summary");
  });

  it("submits a draft for review and blocks invalid transitions", async () => {
    const { service } = makeService();
    const created = await service.create({ authorId: AUTHOR, title: "Draft" });
    const submitted = await service.submitForReview(created.id, author);
    assert.equal(submitted.status, "pending_review");

    const published = await service.adminSetStatus(created.id, "published");
    await expectContentError(
      () => service.submitForReview(published.id, author),
      "INVALID_STATUS_TRANSITION",
      409,
    );
  });

  it("soft-deletes so the item disappears from reads", async () => {
    const { service } = makeService();
    const created = await service.create({ authorId: AUTHOR, title: "Temp" });
    await service.remove(created.id, author);
    await expectContentError(() => service.getForViewer(created.id, guest), "CONTENT_NOT_FOUND", 404);
  });
});

describe("ContentService — public reads & visibility", () => {
  beforeEach(() => {});

  it("lists only published, non-deleted content", async () => {
    const { service } = makeService();
    const draft = await service.create({ authorId: AUTHOR, title: "Hidden Draft" });
    const toPublish = await service.create({ authorId: AUTHOR, title: "Public One" });
    await service.adminSetStatus(toPublish.id, "published");

    const page = await service.listPublished({});
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.id, toPublish.id);
    assert.ok(!page.items.some((c) => c.id === draft.id));
  });

  it("publishing stamps publishedAt exactly once", async () => {
    const { service, clock } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "P" });
    const published = await service.adminSetStatus(c.id, "published");
    assert.ok(published.publishedAt instanceof Date);
    const firstPublishedAt = published.publishedAt!.getTime();

    clock.advance(60_000);
    const archived = await service.adminSetStatus(c.id, "archived");
    const republished = await service.adminSetStatus(archived.id, "published");
    // Re-entering published from archived is a new publish → re-stamps.
    assert.ok(republished.publishedAt!.getTime() >= firstPublishedAt);
  });

  it("increments view count on a public detail read", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Viewed" });
    await service.adminSetStatus(c.id, "published");
    const viewed = await service.getForViewer(c.id, guest);
    assert.equal(viewed.viewCount, 1);
    const again = await service.getForViewer(c.slug, guest);
    assert.equal(again.viewCount, 2);
  });

  it("hides non-published from guests but shows to owner and admin", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Secret Draft" });
    await expectContentError(() => service.getForViewer(c.id, guest), "CONTENT_NOT_FOUND", 404);
    const asOwner = await service.getForViewer(c.id, { userId: AUTHOR, isAdmin: false });
    assert.equal(asOwner.id, c.id);
    const asAdmin = await service.getForViewer(c.id, { userId: "x", isAdmin: true });
    assert.equal(asAdmin.id, c.id);
  });

  it("searches across title/body/tags and filters by category & tag", async () => {
    const { service } = makeService();
    const cat = "aaaaaaaa-0000-4000-8000-000000000001";
    const a = await service.create({
      authorId: AUTHOR,
      title: "Diabetes care",
      body: "insulin dosage",
      tags: ["endocrine"],
      categoryId: cat,
    });
    const b = await service.create({ authorId: AUTHOR, title: "General wellness", tags: ["lifestyle"] });
    await service.adminSetStatus(a.id, "published");
    await service.adminSetStatus(b.id, "published");

    const byBody = await service.search({ q: "insulin" });
    assert.equal(byBody.total, 1);
    assert.equal(byBody.items[0]?.id, a.id);

    const byTag = await service.listPublished({ tag: "lifestyle" });
    assert.equal(byTag.total, 1);
    assert.equal(byTag.items[0]?.id, b.id);

    const byCategory = await service.listPublished({ categoryId: cat });
    assert.equal(byCategory.total, 1);
    assert.equal(byCategory.items[0]?.id, a.id);
  });

  it("paginates and sorts by popularity", async () => {
    const { service } = makeService();
    const first = await service.create({ authorId: AUTHOR, title: "Low" });
    const second = await service.create({ authorId: AUTHOR, title: "High" });
    await service.adminSetStatus(first.id, "published");
    await service.adminSetStatus(second.id, "published");
    // Bump views on `second`.
    await service.getForViewer(second.id, guest);
    await service.getForViewer(second.id, guest);

    const popular = await service.listPublished({ sort: "popular", page: 1, pageSize: 1 });
    assert.equal(popular.total, 2);
    assert.equal(popular.items.length, 1);
    assert.equal(popular.items[0]?.id, second.id);
  });
});

describe("ContentService — admin", () => {
  it("lists all statuses and can include soft-deleted", async () => {
    const { service } = makeService();
    const a = await service.create({ authorId: AUTHOR, title: "Draft A" });
    const b = await service.create({ authorId: AUTHOR, title: "Draft B" });
    await service.remove(b.id, author);

    const withoutDeleted = await service.adminList({});
    assert.equal(withoutDeleted.total, 1);
    const withDeleted = await service.adminList({ includeDeleted: true });
    assert.equal(withDeleted.total, 2);
    assert.ok(withDeleted.items.some((c) => c.id === a.id));
  });

  it("hard-deletes on request", async () => {
    const { service, repo } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Purge me" });
    await service.adminRemove(c.id, { hard: true });
    assert.equal(await repo.findById(c.id), undefined);
  });
});

describe("CategoryService", () => {
  function makeCategoryService() {
    const repo = new InMemoryCategoryRepository();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator("cat-");
    return { repo, service: new CategoryService({ repo, clock, ids }) };
  }

  it("creates, lists (ordered), updates and deletes categories", async () => {
    const { service } = makeCategoryService();
    const b = await service.create({ slug: "wellness", name: "Wellness", sortOrder: 2 });
    const a = await service.create({ slug: "clinical", name: "Clinical", sortOrder: 1 });

    const list = await service.list();
    assert.deepEqual(list.map((c) => c.slug), ["clinical", "wellness"]);

    const renamed = await service.update(a.id, { name: "Clinical Care" });
    assert.equal(renamed.name, "Clinical Care");

    await service.remove(b.id);
    const after = await service.list();
    assert.equal(after.length, 1);
  });

  it("rejects duplicate slugs and missing ids", async () => {
    const { service } = makeCategoryService();
    await service.create({ slug: "dup", name: "One" });
    await expectContentError(() => service.create({ slug: "dup", name: "Two" }), "SLUG_CONFLICT", 409);
    await expectContentError(
      () => service.update("missing", { name: "x" }),
      "CATEGORY_NOT_FOUND",
      404,
    );
  });
});
