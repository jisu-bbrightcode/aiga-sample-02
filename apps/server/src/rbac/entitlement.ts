import type { MembershipTier } from "../membership/tiers.js";
import { resolveTierPermissions } from "./matrix.js";
import type { PermissionKey } from "./permissions.js";

/**
 * A resolved security principal for the current request.
 *
 * Entitlement combines two orthogonal axes:
 *  - `tier` → membership permissions (via the 3-tier matrix)
 *  - `rolePermissions` → staff/admin permissions (resolved from RBAC roles)
 *
 * This module is pure (no DB, no Express) so it is trivially unit-testable; the
 * middleware layer (`http/middleware/entitlement.ts`) is responsible for
 * building a `Principal` from the session + database.
 */
export interface Principal {
  readonly userId: string | null;
  readonly tier: MembershipTier;
  readonly roleKeys: readonly string[];
  readonly rolePermissions: ReadonlySet<PermissionKey>;
}

/** The implicit principal for an unauthenticated request. */
export const GUEST_PRINCIPAL: Principal = Object.freeze({
  userId: null,
  tier: "guest",
  roleKeys: Object.freeze([]),
  rolePermissions: new Set<PermissionKey>(),
});

/** Union of tier-granted and role-granted permissions. */
export function effectivePermissions(
  principal: Principal,
): ReadonlySet<PermissionKey> {
  const result = new Set<PermissionKey>(resolveTierPermissions(principal.tier));
  for (const perm of principal.rolePermissions) result.add(perm);
  return result;
}

export function can(principal: Principal, permission: PermissionKey): boolean {
  if (principal.rolePermissions.has(permission)) return true;
  return resolveTierPermissions(principal.tier).has(permission);
}

export function canAll(
  principal: Principal,
  permissions: readonly PermissionKey[],
): boolean {
  return permissions.every((permission) => can(principal, permission));
}

export function canAny(
  principal: Principal,
  permissions: readonly PermissionKey[],
): boolean {
  return permissions.some((permission) => can(principal, permission));
}

export function isAuthenticated(principal: Principal): boolean {
  return principal.userId !== null;
}
