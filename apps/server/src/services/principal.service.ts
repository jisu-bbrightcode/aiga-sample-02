import { eq, inArray } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { profiles } from "../db/schema/profiles.js";
import { rolePermissions, userRoles } from "../db/schema/rbac.js";
import { DEFAULT_PROFILE_TIER, type MembershipTier } from "../membership/tiers.js";
import {
  GUEST_PRINCIPAL,
  type Principal,
} from "../rbac/entitlement.js";
import { isPermissionKey, type PermissionKey } from "../rbac/permissions.js";

/**
 * Resolve a full security `Principal` for an authenticated user id by reading
 * their membership tier (profiles) and staff role grants (user_roles →
 * role_permissions). Unauthenticated callers get `GUEST_PRINCIPAL`.
 */
export async function buildPrincipal(
  userId: string | null | undefined,
): Promise<Principal> {
  if (!userId) return GUEST_PRINCIPAL;

  const db = getDb();

  const [profileRow] = await db
    .select({ tier: profiles.tier })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const tier: MembershipTier = profileRow?.tier ?? DEFAULT_PROFILE_TIER;

  const roleRows = await db
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  const roleKeys = roleRows.map((row) => row.roleKey);

  const permissionSet = new Set<PermissionKey>();
  if (roleKeys.length > 0) {
    const permRows = await db
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleKey, roleKeys));
    for (const { permissionKey } of permRows) {
      if (isPermissionKey(permissionKey)) permissionSet.add(permissionKey);
    }
  }

  return Object.freeze({
    userId,
    tier,
    roleKeys: Object.freeze(roleKeys),
    rolePermissions: permissionSet,
  });
}
