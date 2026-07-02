/**
 * Permission catalog — the closed set of capability keys used across the app.
 *
 * Split into two axes:
 *  - membership permissions: granted by the 3-tier matrix (`matrix.ts`).
 *  - staff/admin permissions: granted by RBAC roles (`admin.*`).
 *
 * Keeping the catalog centralized lets the admin RBAC seed and the tier matrix
 * reference the same literal keys with compile-time safety.
 */
export const PERMISSIONS = {
  // --- Content catalog ---
  contentRead: "content.read",
  contentCreate: "content.create",
  contentUpdateOwn: "content.update.own",
  contentDeleteOwn: "content.delete.own",

  // --- Community ---
  communityPost: "community.post.create",
  communityComment: "community.comment.create",
  communityReact: "community.reaction.create",

  // --- Reviews ---
  reviewCreate: "review.create",
  reviewUpdateOwn: "review.update.own",

  // --- Expert (verified doctor only) ---
  expertAnswer: "expert.answer.create",
  expertBadgeDisplay: "expert.badge.display",

  // --- Own profile ---
  profileReadOwn: "profile.read.own",
  profileUpdateOwn: "profile.update.own",

  // --- Admin / staff ---
  adminAccess: "admin.access",
  adminUsersRead: "admin.users.read",
  adminUsersUpdate: "admin.users.update", // includes tier/grade change
  adminContentModerate: "admin.content.moderate",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.freeze(
  Object.values(PERMISSIONS),
);

/** Permissions that are only ever granted through a staff/admin role. */
export const ADMIN_PERMISSIONS: readonly PermissionKey[] = Object.freeze([
  PERMISSIONS.adminAccess,
  PERMISSIONS.adminUsersRead,
  PERMISSIONS.adminUsersUpdate,
  PERMISSIONS.adminContentModerate,
]);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return (
    typeof value === "string" &&
    (ALL_PERMISSIONS as readonly string[]).includes(value)
  );
}
