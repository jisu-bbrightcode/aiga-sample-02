/**
 * Content Catalog — domain types (framework-agnostic).
 *
 * ✅ LOCKED CONTRACT. Implements the canonical `ContentItem` entity frozen in
 * the board-approved contract:
 *   - BBR-1144#document-entity-contract  (Entity & API Contract — LOCKED)
 *   - BBR-1175#document-schema-alignment (Schema Alignment follow-up)
 *
 * Key rules the contract locks:
 *   - `ContentStatus` is exactly `draft | published | hidden`. `pending_review`,
 *     `archived` and `rejected` are NOT lifecycle statuses.
 *   - `reported` is derived from `reportCount > 0` (report metadata, not a
 *     status). `deleted` is derived from `deletedAt` (soft delete, not a status).
 *   - `category` is the fixed enum `notice | free | qna` (notice = admin only).
 *     Disease/condition taxonomy is an orthogonal `conditionTags` facet.
 */

/** Content lifecycle. Moderation is expressed via publish/hide, not extra states. */
export const CONTENT_STATUSES = ["draft", "published", "hidden"] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Statuses visible to anonymous/public (guest) consumers. */
export const PUBLIC_CONTENT_STATUSES: readonly ContentStatus[] = ["published"];

/** Content category (board type). `notice` is authored by admins only. */
export const CONTENT_CATEGORIES = ["notice", "free", "qna"] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export interface ContentItem {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
  readonly category: ContentCategory;
  /** Orthogonal disease/condition facet (SCR-004 filter, SCR-005 grouping). */
  readonly conditionTags: readonly string[];
  readonly coverImageUrl: string | null;
  readonly status: ContentStatus;
  readonly viewCount: number;
  readonly likeCount: number;
  /** Report metadata: the admin queue derives `reported` from `reportCount > 0`. */
  readonly reportCount: number;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/** Sort options for list/search (locked contract: latest | popular | views). */
export type ContentSort = "latest" | "popular" | "views";

/** Command inputs (already validated at the HTTP boundary via zod). */
export interface CreateContentInput {
  readonly authorId: string;
  readonly title: string;
  readonly body?: string;
  readonly category: ContentCategory;
  readonly conditionTags?: readonly string[];
  readonly coverImageUrl?: string | null;
}

/** Fields an author/admin may patch. Status is changed via dedicated actions. */
export interface UpdateContentInput {
  readonly title?: string;
  readonly body?: string;
  readonly category?: ContentCategory;
  readonly conditionTags?: readonly string[];
  readonly coverImageUrl?: string | null;
}

/** Repository-level filter (applied by both public and admin queries). */
export interface ContentQuery {
  readonly q?: string;
  readonly status?: ContentStatus;
  readonly statuses?: readonly ContentStatus[];
  readonly category?: ContentCategory;
  readonly conditionTag?: string;
  readonly authorId?: string;
  /** Admin queue facet: keep only items with `reportCount > 0`. */
  readonly reported?: boolean;
  readonly includeDeleted?: boolean;
  readonly sort?: ContentSort;
  readonly page: number;
  readonly pageSize: number;
}

/** Standard page envelope (aligns with services/users.service.ts). */
export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
