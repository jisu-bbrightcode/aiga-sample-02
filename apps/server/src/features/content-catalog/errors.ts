/**
 * Typed domain errors for the content catalog. Each carries a stable `code`
 * and HTTP `status` so the controller adapter maps them to the standard REST
 * envelope without leaking internals (see security rules).
 */
export type ContentErrorCode = "CONTENT_NOT_FOUND" | "FORBIDDEN";

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

export const forbidden = (message = "Not permitted to modify this content.") =>
  new ContentError("FORBIDDEN", 403, message);
