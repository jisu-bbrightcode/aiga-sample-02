/**
 * Integration ports — the seam between this feature and:
 *   - persistence (Drizzle)                 -> ReviewRepository
 *   - membership / expert badge (BBR-1121)  -> MembershipReader
 *
 * Membership is read-only here: this feature only needs to know an author's tier
 * (to gate 의사인증회원 authorship) and the author/target badge fields for display.
 * The write side of membership lives in the doctor-verification feature.
 */
import type { MembershipTier } from "../../membership/tiers.js";
import type {
  ListReviewsQuery,
  Paginated,
  RatingSummary,
  Review,
} from "./types.js";

export interface InsertReviewData {
  readonly targetUserId: string;
  readonly authorId: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string;
}

export interface UpdateReviewData {
  readonly rating?: number;
  readonly title?: string | null;
  readonly body?: string;
}

export interface ReviewRepository {
  findById(id: string): Promise<Review | undefined>;
  /** Active review by this author for this target, if any (dedupe / edit key). */
  findActiveByAuthorAndTarget(
    authorId: string,
    targetUserId: string,
  ): Promise<Review | undefined>;
  /** Active reviews for a target, paginated + sorted. */
  listActiveByTarget(query: ListReviewsQuery): Promise<Paginated<Review>>;
  /** Aggregate rating (avg/count/distribution) over active reviews for a target. */
  summarize(targetUserId: string): Promise<RatingSummary>;
  insert(data: InsertReviewData): Promise<Review>;
  /** Patch an active review's mutable fields; bumps updatedAt. */
  update(id: string, patch: UpdateReviewData): Promise<Review>;
  /** Soft-delete (status -> 'deleted', sets deletedAt). */
  softDelete(id: string): Promise<Review>;
}

/** Membership snapshot used for authorship checks and badge display. */
export interface MemberBadge {
  readonly userId: string;
  readonly tier: MembershipTier;
  readonly displayName: string | null;
  readonly isExpert: boolean;
  readonly expertBadge: string | null;
  readonly specialty: string | null;
}

export interface MembershipReader {
  getMembership(userId: string): Promise<MemberBadge | undefined>;
  /** Batch fetch (avoids N+1 when enriching a page of reviews). */
  getMemberships(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, MemberBadge>>;
}
