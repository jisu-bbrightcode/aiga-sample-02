/**
 * Domain types for the Community feature (커뮤니티/게시글/댓글/반응).
 *
 * Framework-agnostic and immutable. Ported to the product stack (Express +
 * Drizzle + better-auth, hexagonal per-feature) from the community BE originally
 * delivered against the wrong repo (BBR-1133 / PR #131). See README.md.
 */
import type { MembershipTier } from "../../membership/tiers.js";

/** Lifecycle of a post/comment. Soft-delete + moderation-remove are distinct. */
export type PostStatus = "active" | "removed" | "deleted";
export type CommentStatus = "active" | "removed" | "deleted";

/** Reaction kind (추천/반응). `like` is the default; up/down enable voting. */
export const REACTION_KINDS = ["like", "upvote", "downvote"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/**
 * The caller acting on the community API. Derived from the request principal;
 * a guest has `userId === null` and `tier === 'guest'`. `ip` is used to bucket
 * anonymous post-view limits (등급별 열람 제한) per client.
 */
export interface Actor {
  readonly userId: string | null;
  readonly tier: MembershipTier;
  readonly isAdmin: boolean;
  readonly ip: string | null;
}

/** A community post (게시글). */
export interface Post {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
  readonly category: string | null;
  readonly status: PostStatus;
  readonly pinned: boolean;
  readonly locked: boolean;
  /** Set when this post is a crosspost of another (관리자 crosspost). */
  readonly crosspostOf: string | null;
  readonly viewCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/** Author badge attached to a post/comment for display (전문가 뱃지). */
export interface AuthorBadge {
  readonly userId: string;
  readonly displayName: string | null;
  readonly tier: MembershipTier;
  readonly isExpert: boolean;
  readonly expertBadge: string | null;
  readonly specialty: string | null;
}

/** Read model returned by post endpoints: post + author + reaction count. */
export interface PostView extends Post {
  readonly author: AuthorBadge;
  readonly reactionCount: number;
}

/** A comment (댓글) on a post. */
export interface Comment {
  readonly id: string;
  readonly postId: string;
  readonly authorId: string;
  readonly body: string;
  readonly status: CommentStatus;
  /** 관리자/작성자 상단 고정 (sticky). */
  readonly sticky: boolean;
  /** 관리자 표식 (distinguished). */
  readonly distinguished: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface CommentView extends Comment {
  readonly author: AuthorBadge;
}

/** A single reaction (반응) — at most one active row per (post, user). */
export interface Reaction {
  readonly id: string;
  readonly postId: string;
  readonly userId: string;
  readonly kind: ReactionKind;
  readonly createdAt: Date;
}

/** Result of a (idempotent) cast/remove reaction operation. */
export interface ReactionResult {
  readonly postId: string;
  readonly userId: string;
  readonly kind: ReactionKind | null;
  readonly reactionCount: number;
  /** True when the operation changed state (new reaction / removal). */
  readonly changed: boolean;
}

// --- Moderation (관리자 콘텐츠 모더레이션) -----------------------------------

export const MODERATION_ACTIONS = [
  "pin",
  "unpin",
  "lock",
  "unlock",
  "remove",
  "restore",
  "crosspost",
  "comment_sticky",
  "comment_distinguish",
  "sanction",
  "keyword_filter",
  "content_moderation",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export type ModerationTargetType = "post" | "comment" | "user" | "keyword" | "content";

/** Immutable audit-trail entry recorded for every moderation action (M6). */
export interface ModerationEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: ModerationAction;
  readonly targetType: ModerationTargetType;
  readonly targetId: string;
  readonly reason: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
}

// --- Command inputs (validated at the boundary) -----------------------------

export interface CreatePostInput {
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
  readonly category: string | null;
}

export interface UpdatePostInput {
  readonly title?: string;
  readonly body?: string;
  readonly category?: string | null;
}

export interface CreateCommentInput {
  readonly postId: string;
  readonly authorId: string;
  readonly body: string;
}

export type PostSort = "recent" | "popular";

export interface ListPostsQuery {
  readonly sort: PostSort;
  readonly category?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** Outcome of a daily post-view check (등급별 열람 제한). */
export interface ViewLimitResult {
  /** Whether this view is allowed within the caller's daily bucket. */
  readonly allowed: boolean;
  /** The tier's limit (null = unlimited). */
  readonly limit: number | null;
  /** Distinct posts already viewed in the current 24h window (before this one). */
  readonly used: number;
  /** True when this exact post was already counted in-window (idempotent). */
  readonly alreadyCounted: boolean;
}
