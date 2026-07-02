/** Domain types for Review & Rating. Framework-agnostic, immutable. */

import type { MembershipTier } from "../../membership/tiers.js";

export type ReviewStatus = "active" | "deleted";

/** Valid star ratings. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** A single review row (domain view of the persisted record). */
export interface Review {
  readonly id: string;
  readonly targetUserId: string;
  readonly authorId: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string;
  readonly status: ReviewStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/**
 * Author profile summary attached to a review for display. Sourced live from the
 * `profiles`/`user` tables so the expert badge (전문가 뱃지) always reflects the
 * author's current membership state.
 */
export interface ReviewAuthor {
  readonly userId: string;
  readonly displayName: string | null;
  readonly tier: MembershipTier;
  readonly isExpert: boolean;
  readonly expertBadge: string | null;
  readonly specialty: string | null;
}

/** Read model returned by the list/detail endpoints (review + author badge). */
export interface ReviewView extends Review {
  readonly author: ReviewAuthor;
}

/**
 * Aggregated rating for a target profile. `average` is null when there are no
 * active reviews. `distribution` maps each star value (1..5) to its count.
 */
export interface RatingSummary {
  readonly targetUserId: string;
  readonly count: number;
  readonly average: number | null;
  readonly distribution: Readonly<Record<"1" | "2" | "3" | "4" | "5", number>>;
}

/** Command inputs (already validated at the boundary via zod). */
export interface CreateReviewInput {
  readonly authorId: string;
  readonly targetUserId: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string;
}

export interface UpdateReviewInput {
  readonly reviewId: string;
  readonly authorId: string;
  readonly rating?: number;
  readonly title?: string | null;
  readonly body?: string;
}

export interface DeleteReviewInput {
  readonly reviewId: string;
  readonly actorId: string;
  /** When true the actor is a staff/admin and may delete any review. */
  readonly isAdmin: boolean;
}

export type ReviewSort = "recent" | "rating_desc" | "rating_asc";

export interface ListReviewsQuery {
  readonly targetUserId: string;
  readonly sort: ReviewSort;
  readonly limit: number;
  readonly offset: number;
}

export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
