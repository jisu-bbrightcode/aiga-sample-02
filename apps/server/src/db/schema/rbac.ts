import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";

/**
 * Role-based access control tables (admin axis).
 *
 * The 3-tier *membership* matrix (guest/member/verified_doctor) is resolved in
 * code (`rbac/matrix.ts`) and is the primary entitlement source for end users.
 * These tables model the orthogonal *staff* axis — admin/moderator roles that
 * grant `admin.*` permissions — and let permission grants be managed as data.
 */
export const roles = pgTable("roles", {
  key: text("key").primaryKey(), // e.g. "admin", "moderator"
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(), // e.g. "admin.users.update"
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleKey, table.permissionKey] }),
  }),
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.roleKey] }),
    userIdx: index("user_roles_user_idx").on(table.userId),
  }),
);

export type RoleRow = typeof roles.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;
export type UserRoleRow = typeof userRoles.$inferSelect;
