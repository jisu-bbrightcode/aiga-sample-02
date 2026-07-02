/**
 * Content Catalog — domain types (framework-agnostic).
 *
 * ⚠️ PROVISIONAL CONTRACT. The canonical content entity is still UNDECIDED in
 * the schema definition (BBR-1145 scope). This model is a documented v0 derived
 * from the product's admin sample (medical guides/articles with an approval /
 * moderation workflow) and the shared RBAC permission catalog
 * (`content.read/create/update.own/delete.own`, `admin.content.moderate`).
 * Field names and the status machine are expected to be confirmed via the
 * entity-confirmation follow-up before the contract is frozen.
 */

/** Lifecycle of a content item, including admin moderation states. */
export const CONTENT_STATUSES = [
  "draft", // author working copy, not visible publicly
  "pending_review", // submitted by author, awaiting admin moderation
  "published", // publicly visible
  "archived", // retired from public listing, retained
  "rejected", // moderation rejected, returned to author
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Statuses visible to anonymous/public (guest) consumers. */
export const PUBLIC_CONTENT_STATUSES: readonly ContentStatus[] = ["published"];

export interface Content {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly categoryId: string | null;
  readonly tags: readonly string[];
  readonly status: ContentStatus;
  readonly authorId: string;
  readonly coverImageUrl: string | null;
  readonly viewCount: number;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface Category {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Sort options for list/search. */
export type ContentSort = "newest" | "oldest" | "popular" | "title";

/** Command inputs (already validated at the HTTP boundary via zod). */
export interface CreateContentInput {
  readonly authorId: string;
  readonly title: string;
  readonly summary?: string;
  readonly body?: string;
  readonly slug?: string;
  readonly categoryId?: string | null;
  readonly tags?: readonly string[];
  readonly coverImageUrl?: string | null;
}

/** Fields an author/admin may patch. Status is changed via dedicated actions. */
export interface UpdateContentInput {
  readonly title?: string;
  readonly summary?: string;
  readonly body?: string;
  readonly slug?: string;
  readonly categoryId?: string | null;
  readonly tags?: readonly string[];
  readonly coverImageUrl?: string | null;
}

/** Repository-level filter (applied by both public and admin queries). */
export interface ContentQuery {
  readonly q?: string;
  readonly status?: ContentStatus;
  readonly statuses?: readonly ContentStatus[];
  readonly categoryId?: string;
  readonly tag?: string;
  readonly authorId?: string;
  readonly includeDeleted?: boolean;
  readonly sort?: ContentSort;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateCategoryInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
}

export interface UpdateCategoryInput {
  readonly slug?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
}

/** Standard page envelope (aligns with services/users.service.ts). */
export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
