/**
 * Application service — orchestrates the review & rating use cases.
 *
 * Depends only on ports (repository, membership reader), so it is fully
 * unit-testable with in-memory fakes and independent of Drizzle / the web
 * framework.
 *
 * Business rules (from BBR-1139 scope):
 *  - Authorship is restricted to 의사인증회원 (verified doctors).
 *  - 본인 프로필 제외 — a member may not review their own profile.
 *  - At most one active review per (author, target); edits reuse it.
 *  - Ratings aggregate (average / count / distribution) over active reviews.
 *
 * NOTE on policy: the shared RBAC matrix (`rbac/matrix.ts`) currently also grants
 * the generic `review.create` permission to the `member` tier. This feature's
 * explicit scope narrows *this* review type to verified doctors, so authorship is
 * gated on the tier below. If the product later wants member-authored reviews,
 * relax `REVIEW_AUTHOR_TIER` — the RBAC permission is already in place.
 */
import type { MembershipTier } from "../../membership/tiers.js";
import {
  duplicateReview,
  forbidden,
  notDoctorVerified,
  reviewNotFound,
  selfReviewForbidden,
  targetNotFound,
} from "./errors.js";
import type { MemberBadge, MembershipReader, ReviewRepository } from "./ports.js";
import type {
  CreateReviewInput,
  DeleteReviewInput,
  ListReviewsQuery,
  Paginated,
  RatingSummary,
  Review,
  ReviewAuthor,
  ReviewView,
  UpdateReviewInput,
} from "./types.js";

/** Membership tier required to author a review in this feature. */
export const REVIEW_AUTHOR_TIER: MembershipTier = "verified_doctor";

export interface ReviewServiceDeps {
  readonly repo: ReviewRepository;
  readonly membership: MembershipReader;
}

/** Build the display author summary from a membership snapshot (or a minimal fallback). */
const toAuthor = (userId: string, badge: MemberBadge | undefined): ReviewAuthor => ({
  userId,
  displayName: badge?.displayName ?? null,
  tier: badge?.tier ?? "member",
  isExpert: badge?.isExpert ?? false,
  expertBadge: badge?.expertBadge ?? null,
  specialty: badge?.specialty ?? null,
});

export class ReviewService {
  private readonly repo: ReviewRepository;
  private readonly membership: MembershipReader;

  constructor(deps: ReviewServiceDeps) {
    this.repo = deps.repo;
    this.membership = deps.membership;
  }

  /** Verified doctor writes a review for a target profile. */
  async create(input: CreateReviewInput): Promise<ReviewView> {
    const author = await this.membership.getMembership(input.authorId);
    if (!author || author.tier !== REVIEW_AUTHOR_TIER) throw notDoctorVerified();

    if (input.authorId === input.targetUserId) throw selfReviewForbidden();

    const target = await this.membership.getMembership(input.targetUserId);
    if (!target) throw targetNotFound();

    const existing = await this.repo.findActiveByAuthorAndTarget(
      input.authorId,
      input.targetUserId,
    );
    if (existing) throw duplicateReview();

    const review = await this.repo.insert({
      targetUserId: input.targetUserId,
      authorId: input.authorId,
      rating: input.rating,
      title: input.title,
      body: input.body,
    });
    return { ...review, author: toAuthor(review.authorId, author) };
  }

  /** Author edits their own review. */
  async update(input: UpdateReviewInput): Promise<ReviewView> {
    const existing = await this.loadActive(input.reviewId);
    if (existing.authorId !== input.authorId) throw forbidden();

    const patch: { rating?: number; title?: string | null; body?: string } = {};
    if (input.rating !== undefined) patch.rating = input.rating;
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;

    const updated = await this.repo.update(existing.id, patch);
    const badge = await this.membership.getMembership(updated.authorId);
    return { ...updated, author: toAuthor(updated.authorId, badge) };
  }

  /** Author (or an admin) soft-deletes a review. */
  async delete(input: DeleteReviewInput): Promise<Review> {
    const existing = await this.loadActive(input.reviewId);
    if (!input.isAdmin && existing.authorId !== input.actorId) throw forbidden();
    return this.repo.softDelete(existing.id);
  }

  /** Public: a single active review with author badge. */
  async getReview(reviewId: string): Promise<ReviewView> {
    const review = await this.loadActive(reviewId);
    const badge = await this.membership.getMembership(review.authorId);
    return { ...review, author: toAuthor(review.authorId, badge) };
  }

  /** Public: paginated active reviews for a target, enriched with author badges. */
  async listByTarget(query: ListReviewsQuery): Promise<Paginated<ReviewView>> {
    const page = await this.repo.listActiveByTarget(query);
    const authorIds = [...new Set(page.items.map((r) => r.authorId))];
    const badges = await this.membership.getMemberships(authorIds);
    return {
      ...page,
      items: page.items.map((r) => ({
        ...r,
        author: toAuthor(r.authorId, badges.get(r.authorId)),
      })),
    };
  }

  /** Public: rating aggregation for a target profile. */
  async getRatingSummary(targetUserId: string): Promise<RatingSummary> {
    return this.repo.summarize(targetUserId);
  }

  private async loadActive(reviewId: string): Promise<Review> {
    const review = await this.repo.findById(reviewId);
    if (!review || review.status !== "active") throw reviewNotFound();
    return review;
  }
}
