import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Minimal credentialed CORS for the public app + admin app origins. Reflects
 * the request origin only when it is in the allow-list, which is required for
 * cookie-based sessions (`Access-Control-Allow-Credentials: true`).
 */
export function cors(allowedOrigins: readonly string[]): RequestHandler {
  const allowSet = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (origin && allowSet.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization",
      );
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
