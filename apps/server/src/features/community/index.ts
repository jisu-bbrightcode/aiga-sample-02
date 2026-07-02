/** Public surface of the community feature. */
export * from "./types.js";
export * from "./errors.js";
export * from "./ports.js";
export * from "./validation.js";
export * from "./schema.js";

export { PostService } from "./post-service.js";
export type {
  PostServiceDeps,
  PostModerationCommand,
  PostModerationResult,
} from "./post-service.js";
export { CommentService } from "./comment-service.js";
export type {
  CommentServiceDeps,
  CommentModerationAction,
  CommentModerationResult,
} from "./comment-service.js";
export { ReactionService } from "./reaction-service.js";
export type { ReactionServiceDeps } from "./reaction-service.js";
export { ModerationService } from "./moderation-service.js";
export type {
  ModerationServiceDeps,
  SanctionInput,
  KeywordFilterInput,
  ContentModerationInput,
} from "./moderation-service.js";
export { PostViewLimiter, VIEW_WINDOW_MS } from "./view-limit-service.js";
export type { PostViewLimiterDeps, RecordViewInput } from "./view-limit-service.js";

export {
  assertCanParticipate,
  assertAdmin,
  assertOwnerOrAdmin,
  viewBucketKey,
} from "./guards.js";
export { toAuthor, loadAuthor, loadAuthors } from "./author.js";

export { createCommunityServices } from "./service.js";
export type { CommunityPorts, CommunityServices } from "./service.js";

export { createCommunityController, toErrorResponse } from "./controller.js";
export type {
  CommunityController,
  HandlerRequest,
  HandlerResponse,
} from "./controller.js";

export { communityRoutes } from "./routes.js";
export type { RouteDef, RequiredRole } from "./routes.js";

export { communityPaths, communityComponents } from "./openapi.js";

export {
  DrizzlePostRepository,
  DrizzleCommentRepository,
  DrizzleReactionRepository,
  DrizzleModerationRepository,
  DrizzlePostViewRepository,
  DrizzleMembershipReader,
} from "./drizzle-repository.js";
export type { DrizzleDb } from "./drizzle-repository.js";

export {
  createCommunityRouter,
  createCommunityServiceFromDb,
} from "./http.js";
export type { CommunityRouterDeps } from "./http.js";
