/** Public surface of the review-rating feature. */
export * from "./types.js";
export * from "./errors.js";
export * from "./ports.js";
export { ReviewService, REVIEW_AUTHOR_TIER } from "./service.js";
export type { ReviewServiceDeps } from "./service.js";
export {
  createReviewRatingController,
  toErrorResponse,
} from "./controller.js";
export type {
  Actor,
  HandlerRequest,
  HandlerResponse,
  ReviewRatingController,
} from "./controller.js";
export { reviewRatingRoutes } from "./routes.js";
export type { RouteDef, RequiredRole } from "./routes.js";
export { reviewRatingPaths, reviewRatingComponents } from "./openapi.js";
export {
  DrizzleReviewRepository,
  DrizzleMembershipReader,
} from "./drizzle-repository.js";
export type { DrizzleDb } from "./drizzle-repository.js";
export {
  createReviewRatingRouter,
  createReviewRatingService,
} from "./http.js";
export type { ReviewRatingRouterDeps } from "./http.js";
export * from "./schema.js";
export * from "./validation.js";
