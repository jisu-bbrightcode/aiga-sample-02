/**
 * Route table — declarative mapping of method+path -> controller handler +
 * required role. The base router (BBR-1117) iterates this to register routes and
 * apply the entitlement middleware (BBR-1121) per `requiredRole`.
 *
 *  - `public` — no authentication required (post/comment reads). Guests are still
 *               subject to the daily view limit inside the service.
 *  - `member` — any authenticated member; the service further gates participation
 *               (canParticipateCommunity) and ownership.
 *  - `admin`  — staff/admin only (moderation surface).
 */
import type { CommunityController } from "./controller.js";

export type RequiredRole = "public" | "member" | "admin";

export interface RouteDef {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly requiredRole: RequiredRole;
  readonly handler: keyof CommunityController;
  readonly summary: string;
}

export const communityRoutes: ReadonlyArray<RouteDef> = [
  // --- Posts ---
  {
    method: "GET",
    path: "/posts",
    requiredRole: "public",
    handler: "listPosts",
    summary: "List community posts (visibility-filtered by tier)",
  },
  {
    method: "POST",
    path: "/posts",
    requiredRole: "member",
    handler: "createPost",
    summary: "Create a post (게시글 작성)",
  },
  {
    method: "GET",
    path: "/posts/:id",
    requiredRole: "public",
    handler: "getPost",
    summary: "Get a post (열람; subject to daily view limit)",
  },
  {
    method: "PATCH",
    path: "/posts/:id",
    requiredRole: "member",
    handler: "updatePost",
    summary: "Edit your own post",
  },
  {
    method: "DELETE",
    path: "/posts/:id",
    requiredRole: "member",
    handler: "deletePost",
    summary: "Delete your own post (author or admin)",
  },
  {
    method: "POST",
    path: "/posts/:id/moderation",
    requiredRole: "admin",
    handler: "moderatePost",
    summary: "Pin/lock/remove/restore/crosspost a post (admin)",
  },
  // --- Comments ---
  {
    method: "GET",
    path: "/posts/:postId/comments",
    requiredRole: "public",
    handler: "listComments",
    summary: "List a post's comments",
  },
  {
    method: "POST",
    path: "/posts/:postId/comments",
    requiredRole: "member",
    handler: "createComment",
    summary: "Comment on a post (댓글 작성)",
  },
  {
    method: "PATCH",
    path: "/comments/:id",
    requiredRole: "member",
    handler: "updateComment",
    summary: "Edit your own comment",
  },
  {
    method: "DELETE",
    path: "/comments/:id",
    requiredRole: "member",
    handler: "deleteComment",
    summary: "Delete your own comment (author or admin)",
  },
  {
    method: "POST",
    path: "/comments/:id/moderation",
    requiredRole: "admin",
    handler: "moderateComment",
    summary: "Sticky/distinguish/remove a comment (admin)",
  },
  // --- Reactions ---
  {
    method: "POST",
    path: "/posts/:postId/reactions",
    requiredRole: "member",
    handler: "react",
    summary: "React to a post (반응/추천; idempotent)",
  },
  {
    method: "DELETE",
    path: "/posts/:postId/reactions",
    requiredRole: "member",
    handler: "unreact",
    summary: "Remove your reaction",
  },
  // --- Admin moderation surface ---
  {
    method: "POST",
    path: "/moderation/sanctions",
    requiredRole: "admin",
    handler: "sanction",
    summary: "Sanction a user (admin)",
  },
  {
    method: "POST",
    path: "/moderation/keyword-filters",
    requiredRole: "admin",
    handler: "keywordFilter",
    summary: "Add a keyword filter (admin)",
  },
  {
    method: "POST",
    path: "/moderation/content-actions",
    requiredRole: "admin",
    handler: "contentModeration",
    summary: "Generic content-moderation action (admin)",
  },
];
