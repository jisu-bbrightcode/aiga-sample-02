import type { Request, Response } from "express";

import { ContentError } from "../../features/content-catalog/errors.js";
import { HttpError } from "../errors.js";

/**
 * Adapt content-catalog domain errors to the transport `HttpError` so the
 * central error middleware renders the standard envelope. Unknown errors are
 * rethrown untouched (ZodError → 400, everything else → opaque 500).
 */
export function guardContent(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof ContentError) {
        throw new HttpError(err.status, err.code, err.message);
      }
      throw err;
    }
  };
}
