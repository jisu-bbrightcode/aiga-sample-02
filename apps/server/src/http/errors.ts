/**
 * Typed HTTP error used across controllers so the central error handler can map
 * failures to a consistent JSON envelope without leaking internals.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, "bad_request", message, details);
  }

  static unauthorized(message = "Authentication required"): HttpError {
    return new HttpError(401, "unauthorized", message);
  }

  static forbidden(message = "Insufficient permissions"): HttpError {
    return new HttpError(403, "forbidden", message);
  }

  static notFound(message = "Resource not found"): HttpError {
    return new HttpError(404, "not_found", message);
  }
}
