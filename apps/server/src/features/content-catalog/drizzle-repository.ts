/**
 * Drizzle-backed implementation of the content repository.
 *
 * SQL specifics (filtering, ILIKE search, jsonb conditionTag containment,
 * ordering, pagination) live here; the service stays persistence-agnostic. Rows
 * are mapped to the immutable domain shape via `toContentItem`.
 */
import { and, count, desc, eq, gt, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import { contentItems, type ContentRow } from "./schema.js";
import type {
  ContentRepository,
  InsertContentData,
  PatchContentData,
} from "./ports.js";
import type { ContentItem, ContentQuery, ContentSort, Paginated } from "./types.js";

const toContentItem = (row: ContentRow): ContentItem => ({
  id: row.id,
  authorId: row.authorId,
  title: row.title,
  body: row.body,
  category: row.category,
  conditionTags: Object.freeze([...((row.conditionTags as string[] | null) ?? [])]),
  coverImageUrl: row.coverImageUrl ?? null,
  status: row.status,
  viewCount: row.viewCount,
  likeCount: row.likeCount,
  reportCount: row.reportCount,
  publishedAt: row.publishedAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? null,
});

const orderBy = (sort: ContentSort): SQL => {
  switch (sort) {
    case "popular":
      return desc(contentItems.likeCount);
    case "views":
      return desc(contentItems.viewCount);
    case "latest":
    default:
      return desc(contentItems.createdAt);
  }
};

export class DrizzleContentRepository implements ContentRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<ContentItem | undefined> {
    const [row] = await this.db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
    return row ? toContentItem(row) : undefined;
  }

  async list(query: ContentQuery): Promise<Paginated<ContentItem>> {
    const where = this.buildWhere(query);
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));

    const rows = await this.db
      .select()
      .from(contentItems)
      .where(where)
      .orderBy(orderBy(query.sort ?? "latest"))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(contentItems)
      .where(where);

    return { items: rows.map(toContentItem), total: Number(total), page, pageSize };
  }

  async insert(data: InsertContentData): Promise<ContentItem> {
    const [row] = await this.db
      .insert(contentItems)
      .values({
        id: data.id,
        authorId: data.authorId,
        title: data.title,
        body: data.body ?? "",
        category: data.category,
        conditionTags: [...(data.conditionTags ?? [])],
        coverImageUrl: data.coverImageUrl ?? null,
        status: data.status,
        publishedAt: data.status === "published" ? data.now : null,
        createdAt: data.now,
        updatedAt: data.now,
      })
      .returning();
    return toContentItem(row!);
  }

  async patch(id: string, data: PatchContentData): Promise<ContentItem> {
    const set: Record<string, unknown> = { updatedAt: data.updatedAt };
    if (data.title !== undefined) set.title = data.title;
    if (data.body !== undefined) set.body = data.body;
    if (data.category !== undefined) set.category = data.category;
    if (data.conditionTags !== undefined) set.conditionTags = [...data.conditionTags];
    if (data.coverImageUrl !== undefined) set.coverImageUrl = data.coverImageUrl;
    if (data.status !== undefined) set.status = data.status;
    if (data.publishedAt !== undefined) set.publishedAt = data.publishedAt;
    if (data.deletedAt !== undefined) set.deletedAt = data.deletedAt;

    const [row] = await this.db
      .update(contentItems)
      .set(set)
      .where(eq(contentItems.id, id))
      .returning();
    return toContentItem(row!);
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

    if (query.category) filters.push(eq(contentItems.category, query.category));
    if (query.authorId) filters.push(eq(contentItems.authorId, query.authorId));
    if (query.reported) filters.push(gt(contentItems.reportCount, 0));
    if (query.conditionTag) {
      filters.push(sql`${contentItems.conditionTags} @> ${JSON.stringify([query.conditionTag])}::jsonb`);
    }
    if (query.q) {
      const term = `%${query.q}%`;
      const search = or(ilike(contentItems.title, term), ilike(contentItems.body, term));
      if (search) filters.push(search);
    }

    if (filters.length === 0) return undefined;
    if (filters.length === 1) return filters[0];
    return and(...filters);
  }
}
