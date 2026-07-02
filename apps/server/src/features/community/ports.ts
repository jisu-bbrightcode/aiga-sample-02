/**
 * Integration ports — the seam between the community services and:
 *   - persistence (Drizzle)                -> Post/Comment/Reaction/Moderation/PostView repos
 *   - membership / expert badge (BBR-1121) -> MembershipReader
 *   - time + id generation                 -> Clock / IdGenerator
 *
 * Services depend only on these interfaces, so they are fully unit-testable with
 * the in-memory fakes in `testing/in-memory.ts`.
 */
import type { MembershipTier } from "../../membership/tiers.js";
import type {
  Comment,
  CommentStatus,
  ListPostsQuery,
  ModerationAction,
  ModerationEntry,
  ModerationTargetType,
  Paginated,
  Post,
  PostStatus,
  Reaction,
  ReactionKind,
} from "./types.js";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

// --- Posts ------------------------------------------------------------------

export interface InsertPostData {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
  readonly category: string | null;
  readonly now: Date;
}

export interface UpdatePostData {
  readonly title?: string;
  readonly body?: string;
  readonly category?: string | null;
  readonly pinned?: boolean;
  readonly locked?: boolean;
  readonly status?: PostStatus;
  readonly crosspostOf?: string | null;
}

export interface PostRepository {
  findById(id: string): Promise<Post | undefined>;
  /**
   * Paginated list restricted to the given statuses (visibility filter). Callers
   * pass `['active']` for the public list and add `'removed'` for admins so
   * moderated content stays hidden from members but visible to staff.
   */
  list(
    query: ListPostsQuery,
    statuses: readonly PostStatus[],
  ): Promise<Paginated<Post>>;
  insert(data: InsertPostData): Promise<Post>;
  /** Patch mutable/moderation fields; bumps updatedAt (`now`). */
  update(id: string, patch: UpdatePostData, now: Date): Promise<Post>;
  /** Soft-delete (status -> 'deleted', sets deletedAt). */
  softDelete(id: string, now: Date): Promise<Post>;
  /** Atomically bump the view counter and return the new value. */
  incrementViewCount(id: string, now: Date): Promise<number>;
}

// --- Comments ---------------------------------------------------------------

export interface InsertCommentData {
  readonly id: string;
  readonly postId: string;
  readonly authorId: string;
  readonly body: string;
  readonly now: Date;
}

export interface UpdateCommentData {
  readonly body?: string;
  readonly sticky?: boolean;
  readonly distinguished?: boolean;
  readonly status?: CommentStatus;
}

export interface CommentRepository {
  findById(id: string): Promise<Comment | undefined>;
  listByPost(postId: string): Promise<ReadonlyArray<Comment>>;
  insert(data: InsertCommentData): Promise<Comment>;
  update(id: string, patch: UpdateCommentData, now: Date): Promise<Comment>;
  softDelete(id: string, now: Date): Promise<Comment>;
}

// --- Reactions --------------------------------------------------------------

export interface ReactionRepository {
  find(postId: string, userId: string): Promise<Reaction | undefined>;
  countByPost(postId: string): Promise<number>;
  insert(data: {
    id: string;
    postId: string;
    userId: string;
    kind: ReactionKind;
    now: Date;
  }): Promise<Reaction>;
  /** Update the kind of an existing reaction (idempotent re-cast). */
  updateKind(id: string, kind: ReactionKind): Promise<Reaction>;
  remove(postId: string, userId: string): Promise<boolean>;
}

// --- Moderation audit -------------------------------------------------------

export interface RecordModerationData {
  readonly id: string;
  readonly actorId: string;
  readonly action: ModerationAction;
  readonly targetType: ModerationTargetType;
  readonly targetId: string;
  readonly reason: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly now: Date;
}

export interface ModerationRepository {
  record(data: RecordModerationData): Promise<ModerationEntry>;
  listByTarget(
    targetType: ModerationTargetType,
    targetId: string,
  ): Promise<ReadonlyArray<ModerationEntry>>;
}

// --- Daily post-view limit (등급별 열람 제한) --------------------------------

export interface PostViewRepository {
  /** Distinct posts viewed by `bucketKey` since `since` (exclusive of older). */
  countDistinctSince(bucketKey: string, since: Date): Promise<number>;
  /** Whether `postId` was already viewed by `bucketKey` since `since`. */
  hasViewedSince(bucketKey: string, postId: string, since: Date): Promise<boolean>;
  /** Record a view event. */
  record(data: {
    id: string;
    bucketKey: string;
    postId: string;
    now: Date;
  }): Promise<void>;
}

// --- Membership (read-only) -------------------------------------------------

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
  getMemberships(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, MemberBadge>>;
}
