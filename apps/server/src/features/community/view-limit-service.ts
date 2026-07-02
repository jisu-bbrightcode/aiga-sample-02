/**
 * 등급별 게시글 열람 일일 제한 (grade-based daily post-view limit).
 *
 * Each caller has a rolling 24h bucket keyed by user id (authenticated) or client
 * IP (guests). Viewing a *distinct* post consumes one unit; re-viewing an already
 * counted post in-window is idempotent (does not double-count). A tier whose
 * `dailyPostViewLimit` policy is `null` is unlimited (verified doctors).
 *
 * Boundary contract (QA BBR-1134 §2):
 *  - Nth distinct view within window  -> allowed (at the limit).
 *  - (N+1)th distinct view            -> denied (429 POST_VIEW_DAILY_LIMIT_EXCEEDED).
 *  - window rollover (>24h)           -> counts reset.
 */
import { resolvePolicy } from "../../membership/policy.js";
import type { MembershipTier } from "../../membership/tiers.js";
import type { Clock, IdGenerator, PostViewRepository } from "./ports.js";
import type { ViewLimitResult } from "./types.js";

export const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PostViewLimiterDeps {
  readonly views: PostViewRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RecordViewInput {
  readonly bucketKey: string;
  readonly tier: MembershipTier;
  readonly postId: string;
}

export class PostViewLimiter {
  private readonly views: PostViewRepository;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(deps: PostViewLimiterDeps) {
    this.views = deps.views;
    this.clock = deps.clock;
    this.ids = deps.ids;
  }

  /**
   * Evaluate (and, when allowed + newly counted, record) a post view against the
   * caller's daily bucket. Never throws; the caller decides how to surface a
   * disallowed result (the post service maps it to a 429).
   */
  async recordView(input: RecordViewInput): Promise<ViewLimitResult> {
    const limit = resolvePolicy(input.tier).dailyPostViewLimit;
    const now = this.clock.now();

    // Unlimited tier (verified doctor): always allowed, no accounting needed.
    if (limit === null) {
      return { allowed: true, limit: null, used: 0, alreadyCounted: false };
    }

    const since = new Date(now.getTime() - VIEW_WINDOW_MS);
    const alreadyCounted = await this.views.hasViewedSince(
      input.bucketKey,
      input.postId,
      since,
    );
    const used = await this.views.countDistinctSince(input.bucketKey, since);

    // Idempotent re-view of an already-counted post — allowed, no new record.
    if (alreadyCounted) {
      return { allowed: true, limit, used, alreadyCounted: true };
    }

    // At/over the cap for a *new* distinct post — deny without recording.
    if (used >= limit) {
      return { allowed: false, limit, used, alreadyCounted: false };
    }

    await this.views.record({
      id: this.ids.next(),
      bucketKey: input.bucketKey,
      postId: input.postId,
      now,
    });
    return { allowed: true, limit, used, alreadyCounted: false };
  }
}
