/**
 * Typed domain errors for the content catalog. Each carries a stable `code`
 * and HTTP `status` so the controller adapter maps them to the standard REST
 * envelope without leaking internals (see security rules).
 */
export type ContentErrorCode =
  | "CONTENT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "SLUG_CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "FORBIDDEN";

export class ContentError extends Error {
  readonly code: ContentErrorCode;
  readonly status: number;

  constructor(code: ContentErrorCode, status: number, message: string) {
    super(message);
    this.name = "ContentError";
    this.code = code;
    this.status = status;
  }
}

export const contentNotFound = () =>
  new ContentError("CONTENT_NOT_FOUND", 404, "Content not found.");

export const categoryNotFound = () =>
  new ContentError("CATEGORY_NOT_FOUND", 404, "Category not found.");

export const slugConflict = (slug: string) =>
  new ContentError("SLUG_CONFLICT", 409, `Slug already in use: ${slug}`);

export const invalidStatusTransition = (from: string, to: string) =>
  new ContentError(
    "INVALID_STATUS_TRANSITION",
    409,
    `Cannot transition content from '${from}' to '${to}'.`,
  );

export const forbidden = () =>
  new ContentError("FORBIDDEN", 403, "Not permitted to modify this content.");
