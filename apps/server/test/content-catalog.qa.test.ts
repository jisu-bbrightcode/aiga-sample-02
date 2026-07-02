/**
 * BE QA — 콘텐츠 카탈로그 (Content Catalog) — BBR-1146
 *
 * QA hardening suite that complements the co-located dev tests in
 * `src/features/content-catalog/service.test.ts`. The dev suite drives the
 * service happy paths but bypasses the zod boundary entirely; this suite locks
 * the two QA deliverables from the outside-in:
 *
 *  1. 목록/검색/상세 API 계약 (list / search / detail contract)
 *     - query-param validation contract (listQuerySchema / searchQuerySchema /
 *       adminListQuerySchema) — the HTTP boundary, previously 0% covered
 *     - public visibility, view-count, pagination and sort semantics
 *
 *  2. 작성/편집 권한 및 검증 (write / edit permission & validation)
 *     - create/update body validation contract (createContentSchema /
 *       updateContentSchema / setStatusSchema)
 *     - ownership + admin override + moderation state-machine enforcement
 *
 * Because the content entity is a PROVISIONAL contract (schema entity is still
 * UNDECIDED per BBR-1145), these tests double as the executable specification
 * for the shape the follow-up entity-confirmation must preserve.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContentError } from "../src/features/content-catalog/errors.js";
import {
  CategoryService,
  ContentService,
  type ContentActor,
} from "../src/features/content-catalog/service.js";
import {
  FixedClock,
  InMemoryCategoryRepository,
  InMemoryContentRepository,
  SequentialIdGenerator,
} from "../src/features/content-catalog/testing/in-memory.js";
import {
  adminListQuerySchema,
  createContentSchema,
  listQuerySchema,
  searchQuerySchema,
  setStatusSchema,
  updateContentSchema,
} from "../src/features/content-catalog/validation.js";

// --- fixtures ---------------------------------------------------------------

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CATEGORY = "aaaaaaaa-0000-4000-8000-000000000001";

const admin: ContentActor = { userId: "admin-1", isAdmin: true };
const author: ContentActor = { userId: AUTHOR, isAdmin: false };
const other: ContentActor = { userId: OTHER, isAdmin: false };
const guest = { userId: null, isAdmin: false } as const;

function makeService() {
  const repo = new InMemoryContentRepository();
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  return { repo, clock, ids, service: new ContentService({ repo, clock, ids }) };
}

function makeCategoryService() {
  const repo = new InMemoryCategoryRepository();
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator("cat00000-0000-4000-8000-");
  return { repo, service: new CategoryService({ repo, clock, ids }) };
}

async function expectContentError(fn: () => Promise<unknown>, code: string, status: number) {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ContentError, `expected ContentError, got ${String(err)}`);
    assert.equal(err.code, code, `code`);
    assert.equal(err.status, status, `status`);
    return true;
  });
}

/** Create then publish a content item in one step (moderation path). */
async function publish(
  service: ContentService,
  input: Parameters<ContentService["create"]>[0],
) {
  const created = await service.create(input);
  return service.adminSetStatus(created.id, "published");
}

// ===========================================================================
// Deliverable 1 — 목록/검색/상세 API 계약 (list / search / detail contract)
// ===========================================================================

describe("QA/1 list+search query validation contract", () => {
  it("applies documented defaults (sort=newest, page=1, pageSize=20) on empty input", () => {
    const parsed = listQuerySchema.parse({});
    assert.equal(parsed.sort, "newest");
    assert.equal(parsed.page, 1);
    assert.equal(parsed.pageSize, 20);
  });

  it("coerces page/pageSize from query-string numbers", () => {
    const parsed = listQuerySchema.parse({ page: "3", pageSize: "50" });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.pageSize, 50);
  });

  it("rejects pageSize over the 100 hard cap", () => {
    assert.equal(listQuerySchema.safeParse({ pageSize: "101" }).success, false);
  });

  it("rejects a non-positive or non-integer page", () => {
    assert.equal(listQuerySchema.safeParse({ page: "0" }).success, false);
    assert.equal(listQuerySchema.safeParse({ page: "-1" }).success, false);
    assert.equal(listQuerySchema.safeParse({ page: "1.5" }).success, false);
  });

  it("rejects an unknown sort key", () => {
    assert.equal(listQuerySchema.safeParse({ sort: "trending" }).success, false);
  });

  it("rejects a non-uuid categoryId filter", () => {
    assert.equal(listQuerySchema.safeParse({ categoryId: "not-a-uuid" }).success, false);
    assert.equal(listQuerySchema.safeParse({ categoryId: CATEGORY }).success, true);
  });

  it("search requires a non-empty q; blank/whitespace is rejected", () => {
    assert.equal(searchQuerySchema.safeParse({}).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: "   " }).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: "insulin" }).success, true);
  });

  it("admin list coerces includeDeleted and defaults it to false when omitted", () => {
    assert.equal(adminListQuerySchema.parse({}).includeDeleted, false);
    assert.equal(adminListQuerySchema.parse({ includeDeleted: "true" }).includeDeleted, true);
    assert.equal(adminListQuerySchema.parse({ includeDeleted: "false" }).includeDeleted, false);
  });

  it("admin list accepts status + authorId filters that the public list does not expose", () => {
    assert.equal("status" in adminListQuerySchema.parse({ status: "archived" }), true);
    assert.equal(adminListQuerySchema.safeParse({ status: "bogus" }).success, false);
    assert.equal(adminListQuerySchema.safeParse({ authorId: "nope" }).success, false);
  });
});

describe("QA/1 public list visibility", () => {
  it("guests see ONLY published — draft/pending/archived/rejected are all hidden", async () => {
    const { service } = makeService();
    const published = await publish(service, { authorId: AUTHOR, title: "Live" });
    await service.create({ authorId: AUTHOR, title: "Draft" }); // stays draft
    const pending = await service.create({ authorId: AUTHOR, title: "Pending" });
    await service.submitForReview(pending.id, author);
    const archived = await publish(service, { authorId: AUTHOR, title: "Archived" });
    await service.adminSetStatus(archived.id, "archived");

    const page = await service.listPublished({});
    assert.deepEqual(page.items.map((c) => c.id), [published.id]);
    assert.equal(page.total, 1);
  });

  it("filters by category and tag independently", async () => {
    const { service } = makeService();
    const a = await publish(service, {
      authorId: AUTHOR,
      title: "Cardiology",
      tags: ["heart"],
      categoryId: CATEGORY,
    });
    await publish(service, { authorId: AUTHOR, title: "General", tags: ["wellness"] });

    const byCategory = await service.listPublished({ categoryId: CATEGORY });
    assert.deepEqual(byCategory.items.map((c) => c.id), [a.id]);

    const byTag = await service.listPublished({ tag: "heart" });
    assert.deepEqual(byTag.items.map((c) => c.id), [a.id]);

    const byMissingTag = await service.listPublished({ tag: "does-not-exist" });
    assert.equal(byMissingTag.total, 0);
  });
});

describe("QA/1 search semantics", () => {
  it("never returns non-published items even when the query text matches", async () => {
    const { service } = makeService();
    // A draft whose body clearly matches the query must NOT surface publicly.
    await service.create({ authorId: AUTHOR, title: "Secret", body: "insulin protocol" });
    const hit = await publish(service, { authorId: AUTHOR, title: "Public insulin guide" });

    const results = await service.search({ q: "insulin" });
    assert.deepEqual(results.items.map((c) => c.id), [hit.id]);
  });

  it("matches across title, summary, body and tags", async () => {
    const { service } = makeService();
    const byTitle = await publish(service, { authorId: AUTHOR, title: "Diabetes overview" });
    const bySummary = await publish(service, { authorId: AUTHOR, title: "X", summary: "about diabetes" });
    const byBody = await publish(service, { authorId: AUTHOR, title: "Y", body: "managing diabetes daily" });
    const byTag = await publish(service, { authorId: AUTHOR, title: "Z", tags: ["diabetes"] });

    const results = await service.search({ q: "diabetes", pageSize: 100 });
    const ids = new Set(results.items.map((c) => c.id));
    for (const c of [byTitle, bySummary, byBody, byTag]) {
      assert.ok(ids.has(c.id), `expected ${c.title} in results`);
    }
    assert.equal(results.total, 4);
  });
});

describe("QA/1 detail (getForViewer)", () => {
  it("resolves a published item by id AND by slug for a guest", async () => {
    const { service } = makeService();
    const c = await publish(service, { authorId: AUTHOR, title: "By Key" });
    assert.equal((await service.getForViewer(c.id, guest)).id, c.id);
    assert.equal((await service.getForViewer(c.slug, guest)).id, c.id);
  });

  it("returns CONTENT_NOT_FOUND for an unknown id/slug", async () => {
    const { service } = makeService();
    await expectContentError(() => service.getForViewer("ghost", guest), "CONTENT_NOT_FOUND", 404);
  });

  it("returns CONTENT_NOT_FOUND for a soft-deleted item (even to its owner)", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Temp" });
    await service.remove(c.id, author);
    await expectContentError(() => service.getForViewer(c.id, author), "CONTENT_NOT_FOUND", 404);
  });

  it("hides a pending_review item from guests and non-owners, but shows owner + admin", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Under Review" });
    await service.submitForReview(c.id, author);

    await expectContentError(() => service.getForViewer(c.id, guest), "CONTENT_NOT_FOUND", 404);
    await expectContentError(
      () => service.getForViewer(c.id, { userId: OTHER, isAdmin: false }),
      "CONTENT_NOT_FOUND",
      404,
    );
    assert.equal((await service.getForViewer(c.id, author)).id, c.id);
    assert.equal((await service.getForViewer(c.id, admin)).id, c.id);
  });

  it("increments view count ONLY on a public (published) read — private reads do not", async () => {
    const { service, repo } = makeService();
    const draft = await service.create({ authorId: AUTHOR, title: "Quiet Draft" });
    await service.getForViewer(draft.id, author); // owner viewing own draft
    assert.equal((await repo.findById(draft.id))?.viewCount, 0);

    const pub = await publish(service, { authorId: AUTHOR, title: "Loud" });
    const first = await service.getForViewer(pub.id, guest);
    assert.equal(first.viewCount, 1);
    const second = await service.getForViewer(pub.slug, guest);
    assert.equal(second.viewCount, 2);
    assert.equal((await repo.findById(pub.id))?.viewCount, 2);
  });
});

describe("QA/1 pagination + sort", () => {
  it("keeps total at the full match count while items honour the page window", async () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i += 1) {
      await publish(service, { authorId: AUTHOR, title: `Item ${i}` });
    }
    const page1 = await service.listPublished({ page: 1, pageSize: 2 });
    assert.equal(page1.total, 5);
    assert.equal(page1.items.length, 2);

    const page3 = await service.listPublished({ page: 3, pageSize: 2 });
    assert.equal(page3.total, 5);
    assert.equal(page3.items.length, 1);

    const beyond = await service.listPublished({ page: 99, pageSize: 2 });
    assert.equal(beyond.total, 5);
    assert.equal(beyond.items.length, 0);
  });

  it("orders newest/oldest by creation and title alphabetically", async () => {
    const { service, clock } = makeService();
    const first = await publish(service, { authorId: AUTHOR, title: "Bravo" });
    clock.advance(1000);
    const second = await publish(service, { authorId: AUTHOR, title: "Alpha" });

    assert.deepEqual((await service.listPublished({ sort: "newest" })).items.map((c) => c.id), [
      second.id,
      first.id,
    ]);
    assert.deepEqual((await service.listPublished({ sort: "oldest" })).items.map((c) => c.id), [
      first.id,
      second.id,
    ]);
    assert.deepEqual((await service.listPublished({ sort: "title" })).items.map((c) => c.title), [
      "Alpha",
      "Bravo",
    ]);
  });
});

// ===========================================================================
// Deliverable 2 — 작성/편집 권한 및 검증 (write / edit permission & validation)
// ===========================================================================

describe("QA/2 create body validation contract", () => {
  it("requires a non-empty title (missing / empty / whitespace all rejected)", () => {
    assert.equal(createContentSchema.safeParse({}).success, false);
    assert.equal(createContentSchema.safeParse({ title: "" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "   " }).success, false);
  });

  it("caps title at 200 chars", () => {
    assert.equal(createContentSchema.safeParse({ title: "a".repeat(201) }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "a".repeat(200) }).success, true);
  });

  it("defaults summary and body to empty strings and categoryId/coverImageUrl to null", () => {
    const parsed = createContentSchema.parse({ title: "Ok" });
    assert.equal(parsed.summary, "");
    assert.equal(parsed.body, "");
    assert.equal(parsed.categoryId, null);
    assert.equal(parsed.coverImageUrl, null);
  });

  it("enforces kebab-case slugs (rejects uppercase, spaces, leading/trailing hyphen)", () => {
    for (const bad of ["Bad Slug", "UPPER", "-lead", "trail-", "a--b", "sp ace"]) {
      assert.equal(createContentSchema.safeParse({ title: "t", slug: bad }).success, false, bad);
    }
    assert.equal(createContentSchema.safeParse({ title: "t", slug: "valid-slug-1" }).success, true);
  });

  it("rejects a non-uuid categoryId and a malformed coverImageUrl", () => {
    assert.equal(createContentSchema.safeParse({ title: "t", categoryId: "abc" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "t", coverImageUrl: "not-a-url" }).success, false);
    assert.equal(
      createContentSchema.safeParse({ title: "t", categoryId: CATEGORY, coverImageUrl: "https://x.io/a.png" })
        .success,
      true,
    );
  });

  it("de-duplicates tags and caps the collection at 20", () => {
    const parsed = createContentSchema.parse({ title: "t", tags: ["a", "a", "b"] });
    assert.deepEqual([...parsed.tags!].sort(), ["a", "b"]);
    assert.equal(
      createContentSchema.safeParse({ title: "t", tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })
        .success,
      false,
    );
  });
});

describe("QA/2 update body validation contract", () => {
  it("rejects an empty patch {} (at-least-one-field refine)", () => {
    assert.equal(updateContentSchema.safeParse({}).success, false);
  });

  it("forbids clearing the title to empty/whitespace (data-loss guard)", () => {
    assert.equal(updateContentSchema.safeParse({ title: "" }).success, false);
    assert.equal(updateContentSchema.safeParse({ title: "  " }).success, false);
    assert.equal(updateContentSchema.safeParse({ title: "New Title" }).success, true);
  });

  it("allows an explicit null to clear nullable fields", () => {
    assert.equal(updateContentSchema.safeParse({ categoryId: null }).success, true);
    assert.equal(updateContentSchema.safeParse({ coverImageUrl: null }).success, true);
  });

  it("setStatus body only accepts known lifecycle statuses", () => {
    assert.equal(setStatusSchema.safeParse({ status: "published" }).success, true);
    assert.equal(setStatusSchema.safeParse({ status: "deleted" }).success, false);
    assert.equal(setStatusSchema.safeParse({}).success, false);
  });
});

describe("QA/2 authoring permissions", () => {
  it("creates a draft owned by the author with viewCount 0 and no publishedAt", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "My First" });
    assert.equal(c.status, "draft");
    assert.equal(c.authorId, AUTHOR);
    assert.equal(c.viewCount, 0);
    assert.equal(c.publishedAt, null);
  });

  it("blocks a non-owner edit (FORBIDDEN) while owner and admin succeed", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Mine" });
    await expectContentError(() => service.update(c.id, other, { title: "hijacked" }), "FORBIDDEN", 403);
    assert.equal((await service.update(c.id, author, { title: "Owner Edit" })).title, "Owner Edit");
    assert.equal((await service.update(c.id, admin, { summary: "Admin note" })).summary, "Admin note");
  });

  it("rejects editing a soft-deleted item as CONTENT_NOT_FOUND", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Gone" });
    await service.remove(c.id, author);
    await expectContentError(() => service.update(c.id, author, { title: "x" }), "CONTENT_NOT_FOUND", 404);
  });

  it("treats a no-op slug (same value) as a valid non-conflicting update", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Keep Slug", slug: "keep-slug" });
    const updated = await service.update(c.id, author, { slug: "keep-slug", summary: "changed" });
    assert.equal(updated.slug, "keep-slug");
    assert.equal(updated.summary, "changed");
  });

  it("rejects changing a slug to one already owned by another item (SLUG_CONFLICT)", async () => {
    const { service } = makeService();
    await service.create({ authorId: AUTHOR, title: "A", slug: "taken" });
    const b = await service.create({ authorId: AUTHOR, title: "B", slug: "free" });
    await expectContentError(() => service.update(b.id, author, { slug: "taken" }), "SLUG_CONFLICT", 409);
  });

  it("rejects a non-owner submit-for-review; owner may submit; invalid source status is 409", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Draft" });
    await expectContentError(() => service.submitForReview(c.id, other), "FORBIDDEN", 403);
    assert.equal((await service.submitForReview(c.id, author)).status, "pending_review");

    const pub = await publish(service, { authorId: AUTHOR, title: "Already Live" });
    await expectContentError(
      () => service.submitForReview(pub.id, author),
      "INVALID_STATUS_TRANSITION",
      409,
    );
  });

  it("rejects a non-owner delete; owner soft-deletes; a double-delete is CONTENT_NOT_FOUND", async () => {
    const { service } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "Delete Me" });
    await expectContentError(() => service.remove(c.id, other), "FORBIDDEN", 403);
    await service.remove(c.id, author);
    await expectContentError(() => service.remove(c.id, author), "CONTENT_NOT_FOUND", 404);
  });
});

describe("QA/2 admin moderation", () => {
  it("enforces the state machine — an invalid transition (published→rejected) is 409", async () => {
    const { service } = makeService();
    const pub = await publish(service, { authorId: AUTHOR, title: "Live" });
    await expectContentError(
      () => service.adminSetStatus(pub.id, "rejected"),
      "INVALID_STATUS_TRANSITION",
      409,
    );
  });

  it("stamps publishedAt when entering published and again on re-publish from archived", async () => {
    const { service, clock } = makeService();
    const c = await service.create({ authorId: AUTHOR, title: "P" });
    const published = await service.adminSetStatus(c.id, "published");
    assert.ok(published.publishedAt instanceof Date);
    const firstAt = published.publishedAt!.getTime();

    clock.advance(60_000);
    await service.adminSetStatus(c.id, "archived");
    const re = await service.adminSetStatus(c.id, "published");
    assert.ok(re.publishedAt!.getTime() >= firstAt);
  });

  it("admin edit / status / get on an unknown id all return CONTENT_NOT_FOUND", async () => {
    const { service } = makeService();
    await expectContentError(() => service.adminGetById("nope"), "CONTENT_NOT_FOUND", 404);
    await expectContentError(() => service.adminUpdate("nope", { title: "x" }), "CONTENT_NOT_FOUND", 404);
    await expectContentError(() => service.adminSetStatus("nope", "published"), "CONTENT_NOT_FOUND", 404);
  });

  it("hard-delete purges the row while soft-delete only hides it", async () => {
    const { service, repo } = makeService();
    const soft = await service.create({ authorId: AUTHOR, title: "Soft" });
    await service.adminRemove(soft.id);
    assert.ok((await repo.findById(soft.id))?.deletedAt, "soft-deleted row is retained");

    const hard = await service.create({ authorId: AUTHOR, title: "Hard" });
    await service.adminRemove(hard.id, { hard: true });
    assert.equal(await repo.findById(hard.id), undefined);
  });

  it("admin list surfaces every status and can include soft-deleted", async () => {
    const { service } = makeService();
    await service.create({ authorId: AUTHOR, title: "Draft" });
    const gone = await service.create({ authorId: AUTHOR, title: "Removed" });
    await service.remove(gone.id, author);

    assert.equal((await service.adminList({})).total, 1);
    assert.equal((await service.adminList({ includeDeleted: true })).total, 2);
  });
});

describe("QA/2 category authoring", () => {
  it("rejects duplicate slugs on create and unknown ids on update/remove", async () => {
    const { service } = makeCategoryService();
    await service.create({ slug: "clinical", name: "Clinical" });
    await expectContentError(
      () => service.create({ slug: "clinical", name: "Dup" }),
      "SLUG_CONFLICT",
      409,
    );
    await expectContentError(() => service.update("ghost", { name: "x" }), "CATEGORY_NOT_FOUND", 404);
    await expectContentError(() => service.remove("ghost"), "CATEGORY_NOT_FOUND", 404);
  });
});
