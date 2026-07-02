/**
 * Typed domain errors for the community feature. Each carries a stable `code`
 * and an HTTP `status` so the controller maps them to REST responses without
 * leaking internals (mirrors review-rating's error model).
 */

export type CommunityErrorCode =
  | "POST_NOT_FOUND"
  | "COMMENT_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "PARTICIPATION_FORBIDDEN"
  | "POST_LOCKED"
  | "FORBIDDEN"
  | "ADMIN_REQUIRED"
  | "POST_VIEW_DAILY_LIMIT_EXCEEDED";

export class CommunityError extends Error {
  readonly code: CommunityErrorCode;
  readonly status: number;

  constructor(code: CommunityErrorCode, status: number, message: string) {
    super(message);
    this.name = "CommunityError";
    this.code = code;
    this.status = status;
  }
}

export const postNotFound = () =>
  new CommunityError("POST_NOT_FOUND", 404, "Post not found.");

export const commentNotFound = () =>
  new CommunityError("COMMENT_NOT_FOUND", 404, "Comment not found.");

export const userNotFound = () =>
  new CommunityError("USER_NOT_FOUND", 404, "Target user not found.");

/** 커뮤니티 참여 불가 — guest tier cannot create posts/comments/reactions. */
export const participationForbidden = () =>
  new CommunityError(
    "PARTICIPATION_FORBIDDEN",
    403,
    "Your membership tier cannot participate in the community.",
  );

export const postLocked = () =>
  new CommunityError("POST_LOCKED", 403, "This post is locked.");

/** Not the owner (and not an admin). */
export const forbidden = () =>
  new CommunityError("FORBIDDEN", 403, "Not permitted to modify this resource.");

/** Moderation surface requires an admin actor. */
export const adminRequired = () =>
  new CommunityError("ADMIN_REQUIRED", 403, "Admin access required.");

/** 등급별 게시글 열람 일일 제한 초과. */
export const postViewDailyLimitExceeded = () =>
  new CommunityError(
    "POST_VIEW_DAILY_LIMIT_EXCEEDED",
    429,
    "Daily post-view limit exceeded for your membership tier.",
  );
