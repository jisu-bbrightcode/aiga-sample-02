/**
 * In-memory repository + deterministic clock/id fakes.
 *
 * Used by the unit tests and available as the `CONTENT_STORE=memory` runtime
 * backend for local development without a database. The implementation is
 * intentionally immutable: stored records are never mutated in place — every
 * write produces a new frozen object.
 */
import type {
  Clock,
  ContentRepository,
  IdGenerator,
  InsertContentData,
  PatchContentData,
} from "../ports.js";
import type { ContentItem, ContentQuery, ContentSort, Paginated } from "../types.js";

/** Fixed clock — returns the same instant unless advanced. */
export class FixedClock implements Clock {
  private current: Date;
  constructor(start: Date = new Date("2026-01-01T00:00:00.000Z")) {
    this.current = start;
  }
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Deterministic, monotonically increasing uuid-shaped id generator. */
export class SequentialIdGenerator implements IdGenerator {
  private seq = 0;
  constructor(private readonly prefix = "00000000-0000-4000-8000-") {}
  next(): string {
    this.seq += 1;
    return `${this.prefix}${this.seq.toString().padStart(12, "0")}`;
  }
}

const matchesQuery = (content: ContentItem, q: string): boolean => {
  const haystack = [content.title, content.body].join("\n").toLowerCase();
  return haystack.includes(q.toLowerCase());
};

const comparators: Record<ContentSort, (a: ContentItem, b: ContentItem) => number> = {
  latest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  popular: (a, b) => b.likeCount - a.likeCount || b.createdAt.getTime() - a.createdAt.getTime(),
  views: (a, b) => b.viewCount - a.viewCount || b.createdAt.getTime() - a.createdAt.getTime(),
};

export class InMemoryContentRepository implements ContentRepository {
  private readonly store = new Map<string, ContentItem>();

  /** Seed helper for tests — inserts a fully-formed record. */
  seed(content: ContentItem): void {
    this.store.set(content.id, Object.freeze({ ...content }));
  }

  async findById(id: string): Promise<ContentItem | undefined> {
    return this.store.get(id);
  }

  async list(query: ContentQuery): Promise<Paginated<ContentItem>> {
    const statuses = query.statuses ?? (query.status ? [query.status] : undefined);
    let rows = [...this.store.values()].filter((content) => {
      if (!query.includeDeleted && content.deletedAt) return false;
      if (statuses && !statuses.includes(content.status)) return false;
      if (query.category && content.category !== query.category) return false;
      if (query.authorId && content.authorId !== query.authorId) return false;
      if (query.reported && content.reportCount <= 0) return false;
      if (query.conditionTag && !content.conditionTags.includes(query.conditionTag)) return false;
      if (query.q && !matchesQuery(content, query.q)) return false;
      return true;
    });

    rows = rows.sort(comparators[query.sort ?? "latest"]);

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    const items = rows.slice(start, start + query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async insert(data: InsertContentData): Promise<ContentItem> {
    const content: ContentItem = Object.freeze({
      id: data.id,
      authorId: data.authorId,
      title: data.title,
      body: data.body ?? "",
      category: data.category,
      conditionTags: Object.freeze([...(data.conditionTags ?? [])]),
      coverImageUrl: data.coverImageUrl ?? null,
      status: data.status,
      viewCount: 0,
      likeCount: 0,
      reportCount: 0,
      publishedAt: data.status === "published" ? data.now : null,
      createdAt: data.now,
      updatedAt: data.now,
      deletedAt: null,
    });
    this.store.set(content.id, content);
    return content;
  }

  async patch(id: string, data: PatchContentData): Promise<ContentItem> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`content ${id} not found`);
    const next: ContentItem = Object.freeze({
      ...existing,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.conditionTags !== undefined
        ? { conditionTags: Object.freeze([...data.conditionTags]) }
        : {}),
      ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
      ...(data.deletedAt !== undefined ? { deletedAt: data.deletedAt } : {}),
      updatedAt: data.updatedAt,
    });
    this.store.set(id, next);
    return next;
  }

  async incrementViewCount(id: string): Promise<void> {
    const existing = this.store.get(id);
    if (!existing) return;
    this.store.set(id, Object.freeze({ ...existing, viewCount: existing.viewCount + 1 }));
  }

  async hardDelete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
