/**
 * BE QA — 콘텐츠 카탈로그 (Content Catalog) — BBR-1146, realigned to the LOCKED
 * ContentItem contract (BBR-1176 / BBR-1144#document-entity-contract).
 *
 * QA hardening suite that complements the co-located dev tests in
 * `src/features/content-catalog/service.test.ts`. The dev suite drives the
 * service happy paths but bypasses the zod boundary; this suite locks the two QA
 * deliverables from the outside-in:
 *
 *  1. 목록/검색/상세 API 계약 (list / search / detail contract)
 *     - query-param validation contract (listQuerySchema / searchQuerySchema /
 *       adminListQuerySchema) — the HTTP boundary
 *     - public visibility, view-count, pagination and sort semantics
 *
 *  2. 작성/편집 권한 및 검증 (write / edit permission & validation)
 *     - create/update body validation contract (createContentSchema /
 *       updateContentSchema / setStatusSchema)
 *     - ownership + admin override + publish/hide/restore moderation
 *
 * The entity is now the frozen canonical contract, so these tests double as the
 * executable specification the FE integration (tracked separately) consumes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContentError } from "../src/features/content-catalog/errors.js";
import { ContentService, type ContentActor } from "../src/features/content-catalog/service.js";
import {
  FixedClock,
  InMemoryContentRepository,
  SequentialIdGenerator,
} from "../src/features/content-catalog/testing/in-memory.js";
import type { CreateContentInput } from "../src/features/content-catalog/types.js";
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

/** Build a valid create input; category defaults to the member-writable `free`. */
function draft(overrides: Partial<CreateContentInput> = {}): CreateContentInput {
  return { authorId: AUTHOR, title: "Untitled", category: "free", ...overrides };
}

async function expectContentError(fn: () => Promise<unknown>, code: string, status: number) {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ContentError, `expected ContentError, got ${String(err)}`);
    assert.equal(err.code, code, `code`);
    assert.equal(err.status, status, `status`);
    return true;
  });
}

/** Create then publish a content item in one step. */
async function publish(service: ContentService, overrides: Partial<CreateContentInput> = {}) {
  const created = await service.create(draft(overrides), admin);
  return service.adminSetStatus(created.id, "published");
}

// ===========================================================================
// Deliverable 1 — 목록/검색/상세 API 계약 (list / search / detail contract)
// ===========================================================================

describe("QA/1 list+search query validation contract", () => {
  it("applies documented defaults (sort=latest, page=1, pageSize=20) on empty input", () => {
    const parsed = listQuerySchema.parse({});
    assert.equal(parsed.sort, "latest");
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

  it("constrains category to the notice|free|qna enum", () => {
    assert.equal(listQuerySchema.safeParse({ category: "clinical" }).success, false);
    assert.equal(listQuerySchema.safeParse({ category: "free" }).success, true);
    assert.equal(listQuerySchema.safeParse({ category: "qna" }).success, true);
  });

  it("accepts an optional conditionTag facet filter", () => {
    assert.equal(listQuerySchema.safeParse({ conditionTag: "diabetes" }).success, true);
    assert.equal(listQuerySchema.safeParse({ conditionTag: "" }).success, false);
  });

  it("search requires a non-empty q; blank/whitespace is rejected", () => {
    assert.equal(searchQuerySchema.safeParse({}).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: "   " }).success, false);
    assert.equal(searchQuerySchema.safeParse({ q: "insulin" }).success, true);
  });

  it("admin list coerces includeDeleted/reported and defaults them to false when omitted", () => {
    const base = adminListQuerySchema.parse({});
    assert.equal(base.includeDeleted, false);
    assert.equal(base.reported, false);
    assert.equal(adminListQuerySchema.parse({ includeDeleted: "true" }).includeDeleted, true);
    assert.equal(adminListQuerySchema.parse({ includeDeleted: "false" }).includeDeleted, false);
    assert.equal(adminListQuerySchema.parse({ reported: "true" }).reported, true);
  });

  it("admin list accepts status + authorId filters that the public list does not expose", () => {
    assert.equal("status" in adminListQuerySchema.parse({ status: "hidden" }), true);
    assert.equal(adminListQuerySchema.safeParse({ status: "archived" }).success, false);
    assert.equal(adminListQuerySchema.safeParse({ status: "bogus" }).success, false);
    assert.equal(adminListQuerySchema.safeParse({ authorId: "nope" }).success, false);
  });
});

describe("QA/1 public list visibility", () => {
  it("guests see ONLY published — draft and hidden are both excluded", async () => {
    const { service } = makeService();
    const published = await publish(service, { title: "Live" });
    await service.create(draft({ title: "Draft" }), author); // stays draft
    const hidden = await publish(service, { title: "Hidden" });
    await service.adminSetStatus(hidden.id, "hidden");

    const page = await service.listPublished({});
    assert.deepEqual(page.items.map((c) => c.id), [published.id]);
    assert.equal(page.total, 1);
  });

  it("filters by category and conditionTag independently", async () => {
    const { service } = makeService();
    const a = await publish(service, { title: "Cardiology", category: "qna", conditionTags: ["heart"] });
    await publish(service, { title: "General", category: "free", conditionTags: ["wellness"] });

    const byCategory = await service.listPublished({ category: "qna" });
    assert.deepEqual(byCategory.items.map((c) => c.id), [a.id]);

    const byTag = await service.listPublished({ conditionTag: "heart" });
    assert.deepEqual(byTag.items.map((c) => c.id), [a.id]);

    const byMissingTag = await service.listPublished({ conditionTag: "does-not-exist" });
    assert.equal(byMissingTag.total, 0);
  });
});

describe("QA/1 search semantics", () => {
  it("never returns non-published items even when the query text matches", async () => {
    const { service } = makeService();
    // A draft whose body clearly matches the query must NOT surface publicly.
    await service.create(draft({ title: "Secret", body: "insulin protocol" }), author);
    const hit = await publish(service, { title: "Public insulin guide" });

    const results = await service.search({ q: "insulin" });
    assert.deepEqual(results.items.map((c) => c.id), [hit.id]);
  });

  it("matches across title and body", async () => {
    const { service } = makeService();
    const byTitle = await publish(service, { title: "Diabetes overview" });
    const byBody = await publish(service, { title: "Y", body: "managing diabetes daily" });
    await publish(service, { title: "Unrelated", body: "general note" });

    const results = await service.search({ q: "diabetes", pageSize: 100 });
    const ids = new Set(results.items.map((c) => c.id));
    assert.ok(ids.has(byTitle.id), "expected title match");
    assert.ok(ids.has(byBody.id), "expected body match");
    assert.equal(results.total, 2);
  });
});

describe("QA/1 detail (getForViewer)", () => {
  it("resolves a published item by id for a guest", async () => {
    const { service } = makeService();
    const c = await publish(service, { title: "By Key" });
    assert.equal((await service.getForViewer(c.id, guest)).id, c.id);
  });

  it("returns CONTENT_NOT_FOUND for an unknown id", async () => {
    const { service } = makeService();
    await expectContentError(() => service.getForViewer("ghost", guest), "CONTENT_NOT_FOUND", 404);
  });

  it("returns CONTENT_NOT_FOUND for a soft-deleted item (even to its owner)", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Temp" }), author);
    await service.remove(c.id, author);
    await expectContentError(() => service.getForViewer(c.id, author), "CONTENT_NOT_FOUND", 404);
  });

  it("hides a hidden (unpublished) item from guests and non-owners, but shows owner + admin", async () => {
    const { service } = makeService();
    const c = await publish(service, { title: "Was Live" });
    await service.adminSetStatus(c.id, "hidden");

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
    const draftItem = await service.create(draft({ title: "Quiet Draft" }), author);
    await service.getForViewer(draftItem.id, author); // owner viewing own draft
    assert.equal((await repo.findById(draftItem.id))?.viewCount, 0);

    const pub = await publish(service, { title: "Loud" });
    const first = await service.getForViewer(pub.id, guest);
    assert.equal(first.viewCount, 1);
    const second = await service.getForViewer(pub.id, guest);
    assert.equal(second.viewCount, 2);
    assert.equal((await repo.findById(pub.id))?.viewCount, 2);
  });
});

describe("QA/1 pagination + sort", () => {
  it("keeps total at the full match count while items honour the page window", async () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i += 1) {
      await publish(service, { title: `Item ${i}` });
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

  it("orders latest by creation (newest first) and views by view count", async () => {
    const { service, clock } = makeService();
    const first = await publish(service, { title: "Bravo" });
    clock.advance(1000);
    const second = await publish(service, { title: "Alpha" });

    assert.deepEqual((await service.listPublished({ sort: "latest" })).items.map((c) => c.id), [
      second.id,
      first.id,
    ]);

    // Make `first` the most-viewed and confirm the views sort surfaces it.
    await service.getForViewer(first.id, guest);
    await service.getForViewer(first.id, guest);
    assert.deepEqual((await service.listPublished({ sort: "views" })).items.map((c) => c.id), [
      first.id,
      second.id,
    ]);
  });
});

// ===========================================================================
// Deliverable 2 — 작성/편집 권한 및 검증 (write / edit permission & validation)
// ===========================================================================

describe("QA/2 create body validation contract", () => {
  it("requires a non-empty title (missing / empty / whitespace all rejected)", () => {
    assert.equal(createContentSchema.safeParse({ category: "free" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "", category: "free" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "   ", category: "free" }).success, false);
  });

  it("requires a valid category from the notice|free|qna enum", () => {
    assert.equal(createContentSchema.safeParse({ title: "Ok" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "Ok", category: "clinical" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "Ok", category: "notice" }).success, true);
  });

  it("caps title at 200 chars", () => {
    assert.equal(createContentSchema.safeParse({ title: "a".repeat(201), category: "free" }).success, false);
    assert.equal(createContentSchema.safeParse({ title: "a".repeat(200), category: "free" }).success, true);
  });

  it("defaults body to an empty string and coverImageUrl to null", () => {
    const parsed = createContentSchema.parse({ title: "Ok", category: "free" });
    assert.equal(parsed.body, "");
    assert.equal(parsed.coverImageUrl, null);
  });

  it("rejects a malformed coverImageUrl and accepts a valid https URL", () => {
    assert.equal(createContentSchema.safeParse({ title: "t", category: "free", coverImageUrl: "not-a-url" }).success, false);
    assert.equal(
      createContentSchema.safeParse({ title: "t", category: "free", coverImageUrl: "https://x.io/a.png" }).success,
      true,
    );
  });

  it("de-duplicates conditionTags and caps the collection at 20", () => {
    const parsed = createContentSchema.parse({ title: "t", category: "free", conditionTags: ["a", "a", "b"] });
    assert.deepEqual([...parsed.conditionTags!].sort(), ["a", "b"]);
    assert.equal(
      createContentSchema.safeParse({
        title: "t",
        category: "free",
        conditionTags: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }).success,
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

  it("allows an explicit null to clear the nullable coverImageUrl", () => {
    assert.equal(updateContentSchema.safeParse({ coverImageUrl: null }).success, true);
  });

  it("rejects an out-of-enum category on patch", () => {
    assert.equal(updateContentSchema.safeParse({ category: "qna" }).success, true);
    assert.equal(updateContentSchema.safeParse({ category: "archived" }).success, false);
  });

  it("setStatus body only accepts the locked lifecycle statuses", () => {
    assert.equal(setStatusSchema.safeParse({ status: "published" }).success, true);
    assert.equal(setStatusSchema.safeParse({ status: "hidden" }).success, true);
    assert.equal(setStatusSchema.safeParse({ status: "draft" }).success, true);
    assert.equal(setStatusSchema.safeParse({ status: "pending_review" }).success, false);
    assert.equal(setStatusSchema.safeParse({ status: "archived" }).success, false);
    assert.equal(setStatusSchema.safeParse({ status: "deleted" }).success, false);
    assert.equal(setStatusSchema.safeParse({}).success, false);
  });
});

describe("QA/2 authoring permissions", () => {
  it("creates a draft owned by the author with zeroed counts and no publishedAt", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "My First" }), author);
    assert.equal(c.status, "draft");
    assert.equal(c.authorId, AUTHOR);
    assert.equal(c.viewCount, 0);
    assert.equal(c.reportCount, 0);
    assert.equal(c.publishedAt, null);
  });

  it("only lets admins author notice content", async () => {
    const { service } = makeService();
    await expectContentError(
      () => service.create(draft({ category: "notice" }), author),
      "FORBIDDEN",
      403,
    );
    assert.equal((await service.create(draft({ category: "notice" }), admin)).category, "notice");
  });

  it("blocks a non-owner edit (FORBIDDEN) while owner and admin succeed", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Mine" }), author);
    await expectContentError(() => service.update(c.id, other, { title: "hijacked" }), "FORBIDDEN", 403);
    assert.equal((await service.update(c.id, author, { title: "Owner Edit" })).title, "Owner Edit");
    assert.equal((await service.update(c.id, admin, { body: "Admin note" })).body, "Admin note");
  });

  it("rejects editing a soft-deleted item as CONTENT_NOT_FOUND", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Gone" }), author);
    await service.remove(c.id, author);
    await expectContentError(() => service.update(c.id, author, { title: "x" }), "CONTENT_NOT_FOUND", 404);
  });

  it("rejects a non-owner delete; owner soft-deletes; a double-delete is CONTENT_NOT_FOUND", async () => {
    const { service } = makeService();
    const c = await service.create(draft({ title: "Delete Me" }), author);
    await expectContentError(() => service.remove(c.id, other), "FORBIDDEN", 403);
    await service.remove(c.id, author);
    await expectContentError(() => service.remove(c.id, author), "CONTENT_NOT_FOUND", 404);
  });
});

describe("QA/2 admin moderation", () => {
  it("stamps publishedAt when entering published and again on re-publish from hidden", async () => {
    const { service, clock } = makeService();
    const c = await service.create(draft({ title: "P" }), author);
    const published = await service.adminSetStatus(c.id, "published");
    assert.ok(published.publishedAt instanceof Date);
    const firstAt = published.publishedAt!.getTime();

    clock.advance(60_000);
    await service.adminSetStatus(c.id, "hidden");
    const re = await service.adminSetStatus(c.id, "published");
    assert.ok(re.publishedAt!.getTime() >= firstAt);
  });

  it("admin edit / status / get on an unknown id all return CONTENT_NOT_FOUND", async () => {
    const { service } = makeService();
    await expectContentError(() => service.adminGetById("nope"), "CONTENT_NOT_FOUND", 404);
    await expectContentError(() => service.adminUpdate("nope", { title: "x" }), "CONTENT_NOT_FOUND", 404);
    await expectContentError(() => service.adminSetStatus("nope", "published"), "CONTENT_NOT_FOUND", 404);
    await expectContentError(() => service.adminRestore("nope"), "CONTENT_NOT_FOUND", 404);
  });

  it("restore clears the soft-delete so the item is readable again", async () => {
    const { service } = makeService();
    const c = await publish(service, { title: "Recoverable" });
    await service.remove(c.id, author);
    await expectContentError(() => service.getForViewer(c.id, guest), "CONTENT_NOT_FOUND", 404);
    const restored = await service.adminRestore(c.id);
    assert.equal(restored.deletedAt, null);
    assert.equal((await service.getForViewer(c.id, guest)).id, c.id);
  });

  it("hard-delete purges the row while soft-delete only hides it", async () => {
    const { service, repo } = makeService();
    const soft = await service.create(draft({ title: "Soft" }), author);
    await service.adminRemove(soft.id);
    assert.ok((await repo.findById(soft.id))?.deletedAt, "soft-deleted row is retained");

    const hard = await service.create(draft({ title: "Hard" }), author);
    await service.adminRemove(hard.id, { hard: true });
    assert.equal(await repo.findById(hard.id), undefined);
  });

  it("admin list surfaces every status, filters reported, and can include soft-deleted", async () => {
    const { service, repo } = makeService();
    await service.create(draft({ title: "Draft" }), author);
    const flagged = await service.create(draft({ title: "Flagged" }), author);
    repo.seed({ ...(await repo.findById(flagged.id))!, reportCount: 2 });
    const gone = await service.create(draft({ title: "Removed" }), author);
    await service.remove(gone.id, author);

    assert.equal((await service.adminList({})).total, 2);
    assert.equal((await service.adminList({ includeDeleted: true })).total, 3);
    const reported = await service.adminList({ reported: true });
    assert.deepEqual(reported.items.map((c) => c.id), [flagged.id]);
  });
});
