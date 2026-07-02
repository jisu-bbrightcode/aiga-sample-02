/**
 * In-memory repository + deterministic clock/id fakes.
 *
 * Used by the unit tests and available as the `CONTENT_STORE=memory` runtime
 * backend for local development without a database. The implementation is
 * intentionally immutable: stored records are never mutated in place — every
 * write produces a new frozen object.
 */
import type {
  CategoryRepository,
  Clock,
  ContentRepository,
  IdGenerator,
  InsertCategoryData,
  InsertContentData,
  PatchCategoryData,
  PatchContentData,
} from "../ports.js";
import type {
  Category,
  Content,
  ContentQuery,
  ContentSort,
  Paginated,
} from "../types.js";

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

const matchesQuery = (content: Content, q: string): boolean => {
  const haystack = [content.title, content.summary, content.body, ...content.tags]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
};

const comparators: Record<ContentSort, (a: Content, b: Content) => number> = {
  newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  oldest: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  popular: (a, b) => b.viewCount - a.viewCount || b.createdAt.getTime() - a.createdAt.getTime(),
  title: (a, b) => a.title.localeCompare(b.title),
};

export class InMemoryContentRepository implements ContentRepository {
  private readonly store = new Map<string, Content>();

  /** Seed helper for tests — inserts a fully-formed record. */
  seed(content: Content): void {
    this.store.set(content.id, Object.freeze({ ...content }));
  }

  async findById(id: string): Promise<Content | undefined> {
    return this.store.get(id);
  }

  async findBySlug(slug: string): Promise<Content | undefined> {
    for (const content of this.store.values()) {
      if (content.slug === slug) return content;
    }
    return undefined;
  }

  async list(query: ContentQuery): Promise<Paginated<Content>> {
    const statuses = query.statuses ?? (query.status ? [query.status] : undefined);
    let rows = [...this.store.values()].filter((content) => {
      if (!query.includeDeleted && content.deletedAt) return false;
      if (statuses && !statuses.includes(content.status)) return false;
      if (query.categoryId && content.categoryId !== query.categoryId) return false;
      if (query.authorId && content.authorId !== query.authorId) return false;
      if (query.tag && !content.tags.includes(query.tag)) return false;
      if (query.q && !matchesQuery(content, query.q)) return false;
      return true;
    });

    rows = rows.sort(comparators[query.sort ?? "newest"]);

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    const items = rows.slice(start, start + query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async insert(data: InsertContentData): Promise<Content> {
    const content: Content = Object.freeze({
      id: data.id,
      slug: data.slug,
      title: data.title,
      summary: data.summary ?? "",
      body: data.body ?? "",
      categoryId: data.categoryId ?? null,
      tags: Object.freeze([...(data.tags ?? [])]),
      status: data.status,
      authorId: data.authorId,
      coverImageUrl: data.coverImageUrl ?? null,
      viewCount: 0,
      publishedAt: data.status === "published" ? data.now : null,
      createdAt: data.now,
      updatedAt: data.now,
      deletedAt: null,
    });
    this.store.set(content.id, content);
    return content;
  }

  async patch(id: string, data: PatchContentData): Promise<Content> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`content ${id} not found`);
    const next: Content = Object.freeze({
      ...existing,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.tags !== undefined ? { tags: Object.freeze([...data.tags]) } : {}),
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

export class InMemoryCategoryRepository implements CategoryRepository {
  private readonly store = new Map<string, Category>();

  seed(category: Category): void {
    this.store.set(category.id, Object.freeze({ ...category }));
  }

  async findById(id: string): Promise<Category | undefined> {
    return this.store.get(id);
  }

  async findBySlug(slug: string): Promise<Category | undefined> {
    for (const category of this.store.values()) {
      if (category.slug === slug) return category;
    }
    return undefined;
  }

  async list(): Promise<readonly Category[]> {
    return [...this.store.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }

  async insert(data: InsertCategoryData): Promise<Category> {
    const category: Category = Object.freeze({
      id: data.id,
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? 0,
      createdAt: data.now,
      updatedAt: data.now,
    });
    this.store.set(category.id, category);
    return category;
  }

  async patch(id: string, data: PatchCategoryData): Promise<Category> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`category ${id} not found`);
    const next: Category = Object.freeze({
      ...existing,
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      updatedAt: data.updatedAt,
    });
    this.store.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
