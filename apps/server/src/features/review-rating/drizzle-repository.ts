/**
 * Drizzle-backed adapters for the persistence + membership-read ports.
 *
 * `DrizzleDb` is a minimal structural type so this module does not pin a specific
 * driver — the base (BBR-1117) supplies the concrete `drizzle(...)` instance via
 * `getDb()` (see `db/client.ts`). When wiring, pass that instance in.
 */
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { user } from "../../db/schema/auth.js";
import { profiles } from "../../db/schema/profiles.js";
import type { MembershipTier } from "../../membership/tiers.js";
import { reviews, type ReviewRow } from "./schema.js";
import type {
  InsertReviewData,
  MemberBadge,
  MembershipReader,
  ReviewRepository,
  UpdateReviewData,
} from "./ports.js";
import type {
  ListReviewsQuery,
  Paginated,
  RatingSummary,
  Review,
} from "./types.js";

/** Minimal structural surface of a drizzle db/transaction handle we rely on. */
export interface DrizzleDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
}

const toReview = (row: ReviewRow): Review => ({
  id: row.id,
  targetUserId: row.targetUserId,
  authorId: row.authorId,
  rating: row.rating,
  title: row.title ?? null,
  body: row.body,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? null,
});

const emptyDistribution = (): Record<"1" | "2" | "3" | "4" | "5", number> => ({
  "1": 0,
  "2": 0,
  "3": 0,
  "4": 0,
  "5": 0,
});

export class DrizzleReviewRepository implements ReviewRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<Review | undefined> {
    const rows: ReviewRow[] = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toReview(row) : undefined;
  }

  async findActiveByAuthorAndTarget(
    authorId: string,
    targetUserId: string,
  ): Promise<Review | undefined> {
    const rows: ReviewRow[] = await this.db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.authorId, authorId),
          eq(reviews.targetUserId, targetUserId),
          eq(reviews.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toReview(row) : undefined;
  }

  async listActiveByTarget(query: ListReviewsQuery): Promise<Paginated<Review>> {
    const where = and(
      eq(reviews.targetUserId, query.targetUserId),
      eq(reviews.status, "active"),
    );

    const orderBy =
      query.sort === "rating_desc"
        ? [desc(reviews.rating), desc(reviews.createdAt)]
        : query.sort === "rating_asc"
          ? [asc(reviews.rating), desc(reviews.createdAt)]
          : [desc(reviews.createdAt)];

    const rows: ReviewRow[] = await this.db
      .select()
      .from(reviews)
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(query.offset);

    const totals: Array<{ value: number }> = await this.db
      .select({ value: count() })
      .from(reviews)
      .where(where);

    return {
      items: rows.map(toReview),
      total: Number(totals[0]?.value ?? 0),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async summarize(targetUserId: string): Promise<RatingSummary> {
    const rows: Array<{ rating: number; value: number }> = await this.db
      .select({ rating: reviews.rating, value: count() })
      .from(reviews)
      .where(
        and(eq(reviews.targetUserId, targetUserId), eq(reviews.status, "active")),
      )
      .groupBy(reviews.rating);

    const distribution = emptyDistribution();
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const n = Number(row.value);
      const key = String(row.rating) as "1" | "2" | "3" | "4" | "5";
      if (key in distribution) distribution[key] = n;
      total += n;
      weighted += n * row.rating;
    }

    return {
      targetUserId,
      count: total,
      average: total === 0 ? null : Math.round((weighted / total) * 100) / 100,
      distribution,
    };
  }

  async insert(data: InsertReviewData): Promise<Review> {
    const rows: ReviewRow[] = await this.db
      .insert(reviews)
      .values({
        targetUserId: data.targetUserId,
        authorId: data.authorId,
        rating: data.rating,
        title: data.title,
        body: data.body,
        status: "active",
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no row");
    return toReview(row);
  }

  async update(id: string, patch: UpdateReviewData): Promise<Review> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.rating !== undefined) set.rating = patch.rating;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.body !== undefined) set.body = patch.body;

    const rows: ReviewRow[] = await this.db
      .update(reviews)
      .set(set)
      .where(and(eq(reviews.id, id), eq(reviews.status, "active")))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Update matched no active review");
    return toReview(row);
  }

  async softDelete(id: string): Promise<Review> {
    const now = new Date();
    const rows: ReviewRow[] = await this.db
      .update(reviews)
      .set({ status: "deleted", deletedAt: now, updatedAt: now })
      .where(and(eq(reviews.id, id), eq(reviews.status, "active")))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Delete matched no active review");
    return toReview(row);
  }
}

/**
 * Reads membership tier + expert-badge fields from the `profiles`/`user` tables.
 * Only the fields this feature needs are projected. `displayName` falls back to
 * the better-auth `user.name` when the profile has no explicit display name.
 */
export class DrizzleMembershipReader implements MembershipReader {
  constructor(private readonly db: DrizzleDb) {}

  private projection() {
    return {
      userId: profiles.userId,
      tier: profiles.tier,
      displayName: profiles.displayName,
      name: user.name,
      isExpert: profiles.isExpert,
      expertBadge: profiles.expertBadge,
      specialty: profiles.specialty,
    };
  }

  private toBadge(row: {
    userId: string;
    tier: MembershipTier;
    displayName: string | null;
    name: string | null;
    isExpert: boolean;
    expertBadge: string | null;
    specialty: string | null;
  }): MemberBadge {
    return {
      userId: row.userId,
      tier: row.tier,
      displayName: row.displayName ?? row.name ?? null,
      isExpert: row.isExpert,
      expertBadge: row.expertBadge ?? null,
      specialty: row.specialty ?? null,
    };
  }

  async getMembership(userId: string): Promise<MemberBadge | undefined> {
    const rows = await this.db
      .select(this.projection())
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .where(eq(profiles.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? this.toBadge(row) : undefined;
  }

  async getMemberships(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, MemberBadge>> {
    const map = new Map<string, MemberBadge>();
    if (userIds.length === 0) return map;
    const rows = await this.db
      .select(this.projection())
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .where(inArray(profiles.userId, [...userIds]));
    for (const row of rows) map.set(row.userId, this.toBadge(row));
    return map;
  }
}
