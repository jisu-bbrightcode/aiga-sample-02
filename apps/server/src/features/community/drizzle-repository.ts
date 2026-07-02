/**
 * Drizzle-backed adapters for the community ports.
 *
 * `DrizzleDb` is a minimal structural type so this module does not pin a specific
 * driver — the base (BBR-1117) supplies the concrete `drizzle(...)` instance via
 * `getDb()` (see `db/client.ts`). When wiring, pass that instance in.
 */
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  sql,
} from "drizzle-orm";

import { user } from "../../db/schema/auth.js";
import { profiles } from "../../db/schema/profiles.js";
import type { MembershipTier } from "../../membership/tiers.js";
import {
  communityComments,
  communityModerationLog,
  communityPosts,
  communityPostViews,
  communityReactions,
  type CommunityCommentRow,
  type CommunityModerationRow,
  type CommunityPostRow,
  type CommunityReactionRow,
} from "./schema.js";
import type {
  CommentRepository,
  InsertCommentData,
  InsertPostData,
  MemberBadge,
  MembershipReader,
  ModerationRepository,
  PostRepository,
  PostViewRepository,
  ReactionRepository,
  RecordModerationData,
  UpdateCommentData,
  UpdatePostData,
} from "./ports.js";
import type {
  Comment,
  ListPostsQuery,
  ModerationAction,
  ModerationEntry,
  ModerationTargetType,
  Paginated,
  Post,
  PostStatus,
  Reaction,
  ReactionKind,
} from "./types.js";

/** Minimal structural surface of a drizzle db/transaction handle we rely on. */
export interface DrizzleDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

const toPost = (row: CommunityPostRow): Post => ({
  id: row.id,
  authorId: row.authorId,
  title: row.title,
  body: row.body,
  category: row.category ?? null,
  status: row.status,
  pinned: row.pinned,
  locked: row.locked,
  crosspostOf: row.crosspostOf ?? null,
  viewCount: row.viewCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? null,
});

const toComment = (row: CommunityCommentRow): Comment => ({
  id: row.id,
  postId: row.postId,
  authorId: row.authorId,
  body: row.body,
  status: row.status,
  sticky: row.sticky,
  distinguished: row.distinguished,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? null,
});

const toReaction = (row: CommunityReactionRow): Reaction => ({
  id: row.id,
  postId: row.postId,
  userId: row.userId,
  kind: row.kind,
  createdAt: row.createdAt,
});

const toModeration = (row: CommunityModerationRow): ModerationEntry => ({
  id: row.id,
  actorId: row.actorId,
  action: row.action as ModerationAction,
  targetType: row.targetType as ModerationTargetType,
  targetId: row.targetId,
  reason: row.reason ?? null,
  metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  createdAt: row.createdAt,
});

export class DrizzlePostRepository implements PostRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<Post | undefined> {
    const rows: CommunityPostRow[] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toPost(row) : undefined;
  }

  async list(
    query: ListPostsQuery,
    statuses: readonly PostStatus[],
  ): Promise<Paginated<Post>> {
    const conds = [inArray(communityPosts.status, [...statuses])];
    if (query.category) conds.push(eq(communityPosts.category, query.category));
    const where = and(...conds);

    const orderBy =
      query.sort === "popular"
        ? [desc(communityPosts.pinned), desc(communityPosts.viewCount), desc(communityPosts.createdAt)]
        : [desc(communityPosts.pinned), desc(communityPosts.createdAt)];

    const rows: CommunityPostRow[] = await this.db
      .select()
      .from(communityPosts)
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(query.offset);

    const totals: Array<{ value: number }> = await this.db
      .select({ value: count() })
      .from(communityPosts)
      .where(where);

    return {
      items: rows.map(toPost),
      total: Number(totals[0]?.value ?? 0),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async insert(data: InsertPostData): Promise<Post> {
    const rows: CommunityPostRow[] = await this.db
      .insert(communityPosts)
      .values({
        id: data.id,
        authorId: data.authorId,
        title: data.title,
        body: data.body,
        category: data.category,
        status: "active",
        createdAt: data.now,
        updatedAt: data.now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no row");
    return toPost(row);
  }

  async update(id: string, patch: UpdatePostData, now: Date): Promise<Post> {
    const set: Record<string, unknown> = { updatedAt: now };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.pinned !== undefined) set.pinned = patch.pinned;
    if (patch.locked !== undefined) set.locked = patch.locked;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.crosspostOf !== undefined) set.crosspostOf = patch.crosspostOf;

    const rows: CommunityPostRow[] = await this.db
      .update(communityPosts)
      .set(set)
      .where(eq(communityPosts.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Update matched no post");
    return toPost(row);
  }

  async softDelete(id: string, now: Date): Promise<Post> {
    const rows: CommunityPostRow[] = await this.db
      .update(communityPosts)
      .set({ status: "deleted", deletedAt: now, updatedAt: now })
      .where(eq(communityPosts.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Delete matched no post");
    return toPost(row);
  }

  async incrementViewCount(id: string, _now: Date): Promise<number> {
    const rows: Array<{ viewCount: number }> = await this.db
      .update(communityPosts)
      .set({ viewCount: sql`${communityPosts.viewCount} + 1` })
      .where(eq(communityPosts.id, id))
      .returning({ viewCount: communityPosts.viewCount });
    return Number(rows[0]?.viewCount ?? 0);
  }
}

export class DrizzleCommentRepository implements CommentRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<Comment | undefined> {
    const rows: CommunityCommentRow[] = await this.db
      .select()
      .from(communityComments)
      .where(eq(communityComments.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toComment(row) : undefined;
  }

  async listByPost(postId: string): Promise<ReadonlyArray<Comment>> {
    const rows: CommunityCommentRow[] = await this.db
      .select()
      .from(communityComments)
      .where(eq(communityComments.postId, postId))
      .orderBy(desc(communityComments.sticky), asc(communityComments.createdAt));
    return rows.map(toComment);
  }

  async insert(data: InsertCommentData): Promise<Comment> {
    const rows: CommunityCommentRow[] = await this.db
      .insert(communityComments)
      .values({
        id: data.id,
        postId: data.postId,
        authorId: data.authorId,
        body: data.body,
        status: "active",
        createdAt: data.now,
        updatedAt: data.now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no row");
    return toComment(row);
  }

  async update(id: string, patch: UpdateCommentData, now: Date): Promise<Comment> {
    const set: Record<string, unknown> = { updatedAt: now };
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.sticky !== undefined) set.sticky = patch.sticky;
    if (patch.distinguished !== undefined) set.distinguished = patch.distinguished;
    if (patch.status !== undefined) set.status = patch.status;

    const rows: CommunityCommentRow[] = await this.db
      .update(communityComments)
      .set(set)
      .where(eq(communityComments.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Update matched no comment");
    return toComment(row);
  }

  async softDelete(id: string, now: Date): Promise<Comment> {
    const rows: CommunityCommentRow[] = await this.db
      .update(communityComments)
      .set({ status: "deleted", deletedAt: now, updatedAt: now })
      .where(eq(communityComments.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Delete matched no comment");
    return toComment(row);
  }
}

export class DrizzleReactionRepository implements ReactionRepository {
  constructor(private readonly db: DrizzleDb) {}

  async find(postId: string, userId: string): Promise<Reaction | undefined> {
    const rows: CommunityReactionRow[] = await this.db
      .select()
      .from(communityReactions)
      .where(
        and(
          eq(communityReactions.postId, postId),
          eq(communityReactions.userId, userId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toReaction(row) : undefined;
  }

  async countByPost(postId: string): Promise<number> {
    const rows: Array<{ value: number }> = await this.db
      .select({ value: count() })
      .from(communityReactions)
      .where(eq(communityReactions.postId, postId));
    return Number(rows[0]?.value ?? 0);
  }

  async insert(data: {
    id: string;
    postId: string;
    userId: string;
    kind: ReactionKind;
    now: Date;
  }): Promise<Reaction> {
    const rows: CommunityReactionRow[] = await this.db
      .insert(communityReactions)
      .values({
        id: data.id,
        postId: data.postId,
        userId: data.userId,
        kind: data.kind,
        createdAt: data.now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no row");
    return toReaction(row);
  }

  async updateKind(id: string, kind: ReactionKind): Promise<Reaction> {
    const rows: CommunityReactionRow[] = await this.db
      .update(communityReactions)
      .set({ kind })
      .where(eq(communityReactions.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Update matched no reaction");
    return toReaction(row);
  }

  async remove(postId: string, userId: string): Promise<boolean> {
    const rows: CommunityReactionRow[] = await this.db
      .delete(communityReactions)
      .where(
        and(
          eq(communityReactions.postId, postId),
          eq(communityReactions.userId, userId),
        ),
      )
      .returning();
    return rows.length > 0;
  }
}

export class DrizzleModerationRepository implements ModerationRepository {
  constructor(private readonly db: DrizzleDb) {}

  async record(data: RecordModerationData): Promise<ModerationEntry> {
    const rows: CommunityModerationRow[] = await this.db
      .insert(communityModerationLog)
      .values({
        id: data.id,
        actorId: data.actorId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        metadata: data.metadata,
        createdAt: data.now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no row");
    return toModeration(row);
  }

  async listByTarget(
    targetType: ModerationTargetType,
    targetId: string,
  ): Promise<ReadonlyArray<ModerationEntry>> {
    const rows: CommunityModerationRow[] = await this.db
      .select()
      .from(communityModerationLog)
      .where(
        and(
          eq(communityModerationLog.targetType, targetType),
          eq(communityModerationLog.targetId, targetId),
        ),
      )
      .orderBy(desc(communityModerationLog.createdAt));
    return rows.map(toModeration);
  }
}

export class DrizzlePostViewRepository implements PostViewRepository {
  constructor(private readonly db: DrizzleDb) {}

  async countDistinctSince(bucketKey: string, since: Date): Promise<number> {
    const rows: Array<{ value: number }> = await this.db
      .select({ value: countDistinct(communityPostViews.postId) })
      .from(communityPostViews)
      .where(
        and(
          eq(communityPostViews.bucketKey, bucketKey),
          gte(communityPostViews.viewedAt, since),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  async hasViewedSince(
    bucketKey: string,
    postId: string,
    since: Date,
  ): Promise<boolean> {
    const rows: Array<{ id: string }> = await this.db
      .select({ id: communityPostViews.id })
      .from(communityPostViews)
      .where(
        and(
          eq(communityPostViews.bucketKey, bucketKey),
          eq(communityPostViews.postId, postId),
          gte(communityPostViews.viewedAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async record(data: {
    id: string;
    bucketKey: string;
    postId: string;
    now: Date;
  }): Promise<void> {
    await this.db.insert(communityPostViews).values({
      id: data.id,
      bucketKey: data.bucketKey,
      postId: data.postId,
      viewedAt: data.now,
    });
  }
}

/** Reads membership tier + expert-badge fields (mirrors review-rating). */
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
