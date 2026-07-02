/**
 * Drizzle-backed implementations of the content + category repositories.
 *
 * SQL specifics (filtering, ILIKE search, jsonb tag containment, ordering,
 * pagination) live here; the service stays persistence-agnostic. Rows are
 * mapped to the immutable domain shape via `toContent` / `toCategory`.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { contentCategories, contentItems, type CategoryRow, type ContentRow } from "./schema.js";
import type {
  CategoryRepository,
  ContentRepository,
  InsertCategoryData,
  InsertContentData,
  PatchCategoryData,
  PatchContentData,
} from "./ports.js";
import type { Category, Content, ContentQuery, ContentSort, Paginated } from "./types.js";

const toContent = (row: ContentRow): Content => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  body: row.body,
  categoryId: row.categoryId ?? null,
  tags: Object.freeze([...((row.tags as string[] | null) ?? [])]),
  status: row.status,
  authorId: row.authorId,
  coverImageUrl: row.coverImageUrl ?? null,
  viewCount: row.viewCount,
  publishedAt: row.publishedAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? null,
});

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description ?? null,
  parentId: row.parentId ?? null,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const orderBy = (sort: ContentSort): SQL => {
  switch (sort) {
    case "oldest":
      return asc(contentItems.createdAt);
    case "popular":
      return desc(contentItems.viewCount);
    case "title":
      return asc(contentItems.title);
    case "newest":
    default:
      return desc(contentItems.createdAt);
  }
};

export class DrizzleContentRepository implements ContentRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Content | undefined> {
    const [row] = await this.db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
    return row ? toContent(row) : undefined;
  }

  async findBySlug(slug: string): Promise<Content | undefined> {
    const [row] = await this.db
      .select()
      .from(contentItems)
      .where(eq(contentItems.slug, slug))
      .limit(1);
    return row ? toContent(row) : undefined;
  }

  async list(query: ContentQuery): Promise<Paginated<Content>> {
    const where = this.buildWhere(query);
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));

    const rows = await this.db
      .select()
      .from(contentItems)
      .where(where)
      .orderBy(orderBy(query.sort ?? "newest"))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(contentItems)
      .where(where);

    return { items: rows.map(toContent), total: Number(total), page, pageSize };
  }

  async insert(data: InsertContentData): Promise<Content> {
    const [row] = await this.db
      .insert(contentItems)
      .values({
        id: data.id,
        slug: data.slug,
        title: data.title,
        summary: data.summary ?? "",
        body: data.body ?? "",
        categoryId: data.categoryId ?? null,
        tags: [...(data.tags ?? [])],
        status: data.status,
        authorId: data.authorId,
        coverImageUrl: data.coverImageUrl ?? null,
        publishedAt: data.status === "published" ? data.now : null,
        createdAt: data.now,
        updatedAt: data.now,
      })
      .returning();
    return toContent(row!);
  }

  async patch(id: string, data: PatchContentData): Promise<Content> {
    const set: Record<string, unknown> = { updatedAt: data.updatedAt };
    if (data.title !== undefined) set.title = data.title;
    if (data.summary !== undefined) set.summary = data.summary;
    if (data.body !== undefined) set.body = data.body;
    if (data.slug !== undefined) set.slug = data.slug;
    if (data.categoryId !== undefined) set.categoryId = data.categoryId;
    if (data.tags !== undefined) set.tags = [...data.tags];
    if (data.coverImageUrl !== undefined) set.coverImageUrl = data.coverImageUrl;
    if (data.status !== undefined) set.status = data.status;
    if (data.publishedAt !== undefined) set.publishedAt = data.publishedAt;
    if (data.deletedAt !== undefined) set.deletedAt = data.deletedAt;

    const [row] = await this.db
      .update(contentItems)
      .set(set)
      .where(eq(contentItems.id, id))
      .returning();
    return toContent(row!);
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.db
      .update(contentItems)
      .set({ viewCount: sql`${contentItems.viewCount} + 1` })
      .where(eq(contentItems.id, id));
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.delete(contentItems).where(eq(contentItems.id, id));
  }

  private buildWhere(query: ContentQuery): SQL | undefined {
    const filters: SQL[] = [];

    if (!query.includeDeleted) filters.push(isNull(contentItems.deletedAt));

    const statuses = query.statuses ?? (query.status ? [query.status] : undefined);
    if (statuses && statuses.length > 0) {
      const statusOr = statuses.map((s) => eq(contentItems.status, s));
      const combined = statusOr.length === 1 ? statusOr[0]! : or(...statusOr)!;
      filters.push(combined);
    }

    if (query.categoryId) filters.push(eq(contentItems.categoryId, query.categoryId));
    if (query.authorId) filters.push(eq(contentItems.authorId, query.authorId));
    if (query.tag) {
      filters.push(sql`${contentItems.tags} @> ${JSON.stringify([query.tag])}::jsonb`);
    }
    if (query.q) {
      const term = `%${query.q}%`;
      const search = or(
        ilike(contentItems.title, term),
        ilike(contentItems.summary, term),
        ilike(contentItems.body, term),
      );
      if (search) filters.push(search);
    }

    if (filters.length === 0) return undefined;
    if (filters.length === 1) return filters[0];
    return and(...filters);
  }
}

export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Category | undefined> {
    const [row] = await this.db
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.id, id))
      .limit(1);
    return row ? toCategory(row) : undefined;
  }

  async findBySlug(slug: string): Promise<Category | undefined> {
    const [row] = await this.db
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.slug, slug))
      .limit(1);
    return row ? toCategory(row) : undefined;
  }

  async list(): Promise<readonly Category[]> {
    const rows = await this.db
      .select()
      .from(contentCategories)
      .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.name));
    return rows.map(toCategory);
  }

  async insert(data: InsertCategoryData): Promise<Category> {
    const [row] = await this.db
      .insert(contentCategories)
      .values({
        id: data.id,
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
        createdAt: data.now,
        updatedAt: data.now,
      })
      .returning();
    return toCategory(row!);
  }

  async patch(id: string, data: PatchCategoryData): Promise<Category> {
    const set: Record<string, unknown> = { updatedAt: data.updatedAt };
    if (data.slug !== undefined) set.slug = data.slug;
    if (data.name !== undefined) set.name = data.name;
    if (data.description !== undefined) set.description = data.description;
    if (data.parentId !== undefined) set.parentId = data.parentId;
    if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;

    const [row] = await this.db
      .update(contentCategories)
      .set(set)
      .where(eq(contentCategories.id, id))
      .returning();
    return toCategory(row!);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(contentCategories).where(eq(contentCategories.id, id));
  }
}
