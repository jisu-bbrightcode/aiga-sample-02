/**
 * Author-badge enrichment shared by the post/comment services. Builds the
 * display author (전문가 뱃지 포함) from a membership snapshot, falling back to a
 * minimal badge when the profile is missing (e.g. legacy rows).
 */
import type { MemberBadge, MembershipReader } from "./ports.js";
import type { AuthorBadge } from "./types.js";

export const toAuthor = (userId: string, badge: MemberBadge | undefined): AuthorBadge => ({
  userId,
  displayName: badge?.displayName ?? null,
  tier: badge?.tier ?? "member",
  isExpert: badge?.isExpert ?? false,
  expertBadge: badge?.expertBadge ?? null,
  specialty: badge?.specialty ?? null,
});

/** Fetch a single author's badge (never throws on a missing profile). */
export async function loadAuthor(
  membership: MembershipReader,
  userId: string,
): Promise<AuthorBadge> {
  const badge = await membership.getMembership(userId);
  return toAuthor(userId, badge);
}

/** Batch author badges for a page of rows (avoids N+1). */
export async function loadAuthors(
  membership: MembershipReader,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, AuthorBadge>> {
  const distinct = [...new Set(userIds)];
  const badges = await membership.getMemberships(distinct);
  const map = new Map<string, AuthorBadge>();
  for (const id of distinct) map.set(id, toAuthor(id, badges.get(id)));
  return map;
}
