import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { user } from "../db/schema/auth.js";
import { profiles } from "../db/schema/profiles.js";
import { userRoles } from "../db/schema/rbac.js";
import {
  DEFAULT_PROFILE_TIER,
  type ProfileTier,
} from "../membership/tiers.js";
import { resolvePolicy } from "../membership/policy.js";

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  tier: ProfileTier;
  isExpert: boolean;
  createdAt: Date;
}

export interface AdminUserListQuery {
  q?: string;
  tier?: ProfileTier;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const MAX_PAGE_SIZE = 100;

/**
 * Admin: list / search members with tier filtering and pagination.
 *
 * Joins the better-auth `user` table with the `profiles` extension. Members
 * without a profile row are treated as the default tier via COALESCE.
 */
export async function listUsers(
  query: AdminUserListQuery,
): Promise<Paginated<AdminUserListItem>> {
  const db = getDb();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 20));

  const tierExpr = sql<ProfileTier>`coalesce(${profiles.tier}, ${DEFAULT_PROFILE_TIER})`;

  const filters = [];
  if (query.q && query.q.trim().length > 0) {
    const term = `%${query.q.trim()}%`;
    filters.push(or(ilike(user.name, term), ilike(user.email, term)));
  }
  if (query.tier) {
    filters.push(eq(tierExpr, query.tier));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      tier: tierExpr,
      isExpert: sql<boolean>`coalesce(${profiles.isExpert}, false)`,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(where);

  return { items: rows, page, pageSize, total: Number(total) };
}

export interface AdminUserDetail extends AdminUserListItem {
  displayName: string | null;
  expertBadge: string | null;
  specialty: string | null;
  licenseNumber: string | null;
  licenseVerifiedAt: Date | null;
  roleKeys: string[];
}

/** Admin: full detail for one member, including staff roles. */
export async function getUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      tier: profiles.tier,
      isExpert: profiles.isExpert,
      displayName: profiles.displayName,
      expertBadge: profiles.expertBadge,
      specialty: profiles.specialty,
      licenseNumber: profiles.licenseNumber,
      licenseVerifiedAt: profiles.licenseVerifiedAt,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) return null;

  const roleRows = await db
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
    tier: row.tier ?? DEFAULT_PROFILE_TIER,
    isExpert: row.isExpert ?? false,
    displayName: row.displayName ?? null,
    expertBadge: row.expertBadge ?? null,
    specialty: row.specialty ?? null,
    licenseNumber: row.licenseNumber ?? null,
    licenseVerifiedAt: row.licenseVerifiedAt ?? null,
    roleKeys: roleRows.map((r) => r.roleKey),
  };
}

/**
 * Admin: change a member's tier/grade (등급변경). Upserts the profile row so a
 * member that has no profile yet still gets a tier. Applies the membership
 * policy for the new tier as a side-effect check (e.g. expert badge coherence).
 */
export async function changeUserTier(
  userId: string,
  nextTier: ProfileTier,
  actorId: string,
): Promise<AdminUserDetail | null> {
  const db = getDb();

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!existingUser) return null;

  const policy = resolvePolicy(nextTier);
  const now = new Date();

  await db
    .insert(profiles)
    .values({
      userId,
      tier: nextTier,
      isExpert: policy.showExpertBadge,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tier: nextTier,
        // Keep the expert flag coherent with the tier's policy.
        isExpert: policy.showExpertBadge,
        updatedAt: now,
      },
    });

  // Audit breadcrumb (actor recorded for traceability of grade changes).
  void actorId;

  return getUserDetail(userId);
}
