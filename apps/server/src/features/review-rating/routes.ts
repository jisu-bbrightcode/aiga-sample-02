/**
 * Route table — declarative mapping of method+path -> controller handler +
 * required role. The base router (BBR-1117) iterates this to register routes and
 * apply the entitlement middleware (BBR-1121) per `requiredRole`.
 *
 *  - `public`  — no authentication required (review reads / rating display).
 *  - `member`  — any authenticated member (the service further gates review
 *                authorship to 의사인증회원 / verified doctors).
 *  - `admin`   — staff/admin only.
 */
import type { ReviewRatingController } from "./controller.js";

export type RequiredRole = "public" | "member" | "admin";

export interface RouteDef {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly requiredRole: RequiredRole;
  readonly handler: keyof ReviewRatingController;
  readonly summary: string;
}

export const reviewRatingRoutes: ReadonlyArray<RouteDef> = [
  {
    method: "POST",
    path: "/profiles/:targetUserId/reviews",
    requiredRole: "member",
    handler: "create",
    summary: "Write a review for a profile (verified doctors only)",
  },
  {
    method: "GET",
    path: "/profiles/:targetUserId/reviews",
    requiredRole: "public",
    handler: "list",
    summary: "List active reviews for a profile",
  },
  {
    method: "GET",
    path: "/profiles/:targetUserId/reviews/summary",
    requiredRole: "public",
    handler: "summary",
    summary: "Rating aggregation (average / count / distribution) for a profile",
  },
  {
    method: "GET",
    path: "/reviews/:id",
    requiredRole: "public",
    handler: "getOne",
    summary: "Get a single review",
  },
  {
    method: "PATCH",
    path: "/reviews/:id",
    requiredRole: "member",
    handler: "update",
    summary: "Edit your own review",
  },
  {
    method: "DELETE",
    path: "/reviews/:id",
    requiredRole: "member",
    handler: "remove",
    summary: "Delete a review (author or admin)",
  },
];
