/**
 * Typed domain errors. Each carries a stable `code` and an HTTP `status` so the
 * controller adapter maps them to REST responses without leaking internals.
 */

export type ReviewErrorCode =
  | "REVIEW_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "NOT_DOCTOR_VERIFIED"
  | "SELF_REVIEW_FORBIDDEN"
  | "DUPLICATE_REVIEW"
  | "FORBIDDEN";

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  readonly status: number;

  constructor(code: ReviewErrorCode, status: number, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
    this.status = status;
  }
}

export const reviewNotFound = () =>
  new ReviewError("REVIEW_NOT_FOUND", 404, "Review not found.");

export const targetNotFound = () =>
  new ReviewError("TARGET_NOT_FOUND", 404, "Review target profile not found.");

/** Authorship is restricted to 의사인증회원 (verified doctors). */
export const notDoctorVerified = () =>
  new ReviewError(
    "NOT_DOCTOR_VERIFIED",
    403,
    "Only verified-doctor members may write reviews.",
  );

/** 본인 프로필 제외 — a member cannot review their own profile. */
export const selfReviewForbidden = () =>
  new ReviewError(
    "SELF_REVIEW_FORBIDDEN",
    403,
    "You cannot review your own profile.",
  );

export const duplicateReview = () =>
  new ReviewError(
    "DUPLICATE_REVIEW",
    409,
    "You have already reviewed this profile; edit your existing review instead.",
  );

export const forbidden = () =>
  new ReviewError("FORBIDDEN", 403, "Not permitted to modify this review.");
