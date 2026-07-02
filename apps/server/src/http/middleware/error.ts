import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { HttpError } from "../errors.js";

/**
 * Central error handler. Maps known error shapes to the standard response
 * envelope `{ ok: false, error: { code, message, details? } }` and hides
 * internal details for unexpected failures.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  // Unexpected: log server-side, return an opaque 500.
  console.error("[unhandled-error]", err);
  res.status(500).json({
    ok: false,
    error: { code: "internal_error", message: "Internal server error" },
  });
}

/** 404 fallback for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { code: "not_found", message: "Route not found" },
  });
}
