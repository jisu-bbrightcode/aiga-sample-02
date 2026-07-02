/**
 * In-memory port implementations + test doubles for the community feature.
 * Immutable-friendly (rows cloned on write); no external I/O. Used by the unit /
 * contract tests (BBR-1134) and local development.
 */
import type {
  Clock,
  CommentRepository,
  IdGenerator,
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
} from "../ports.js";
import type {
  Comment,
  ListPostsQuery,
  ModerationEntry,
  ModerationTargetType,
  Paginated,
  Post,
  PostStatus,
  Reaction,
  ReactionKind,
} from "../types.js";

/** Advanceable clock for deterministic time-window tests. */
export class MutableClock implements Clock {
  private current: Date;
  constructor(start: Date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))) {
    this.current = start;
  }
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private n = 0;
  constructor(private readonly prefix = "id") {}
  next(): string {
    return `${this.prefix}-${++this.n}`;
  }
}

export class InMemoryPostRepository implements PostRepository {
  private rows: Post[] = [];

  async findById(id: string): Promise<Post | undefined> {
    return this.rows.find((r) => r.id === id);
  }

  async list(
    query: ListPostsQuery,
    statuses: readonly PostStatus[],
  ): Promise<Paginated<Post>> {
    const filtered = this.rows.filter(
      (r) =>
        statuses.includes(r.status) &&
        (query.category ? r.category === query.category : true),
    );
    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (query.sort === "popular" && a.viewCount !== b.viewCount) {
        return b.viewCount - a.viewCount;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return {
      items: sorted.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async insert(data: InsertPostData): Promise<Post> {
    const post: Post = {
      id: data.id,
      authorId: data.authorId,
      title: data.title,
      body: data.body,
      category: data.category,
      status: "active",
      pinned: false,
      locked: false,
      crosspostOf: null,
      viewCount: 0,
      createdAt: data.now,
      updatedAt: data.now,
      deletedAt: null,
    };
    this.rows = [...this.rows, post];
    return post;
  }

  private replace(next: Post): Post {
    this.rows = this.rows.map((r) => (r.id === next.id ? next : r));
    return next;
  }

  async update(id: string, patch: UpdatePostData, now: Date): Promise<Post> {
    const current = this.rows.find((r) => r.id === id);
    if (!current) throw new Error("Update matched no post");
    return this.replace({
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.crosspostOf !== undefined ? { crosspostOf: patch.crosspostOf } : {}),
      updatedAt: now,
    });
  }

  async softDelete(id: string, now: Date): Promise<Post> {
    const current = this.rows.find((r) => r.id === id);
    if (!current) throw new Error("Delete matched no post");
    return this.replace({ ...current, status: "deleted", deletedAt: now, updatedAt: now });
  }

  async incrementViewCount(id: string, _now: Date): Promise<number> {
    const current = this.rows.find((r) => r.id === id);
    if (!current) throw new Error("Increment matched no post");
    const next = { ...current, viewCount: current.viewCount + 1 };
    this.replace(next);
    return next.viewCount;
  }
}

export class InMemoryCommentRepository implements CommentRepository {
  private rows: Comment[] = [];

  async findById(id: string): Promise<Comment | undefined> {
    return this.rows.find((r) => r.id === id);
  }

  async listByPost(postId: string): Promise<ReadonlyArray<Comment>> {
    return this.rows
      .filter((r) => r.postId === postId)
      .sort((a, b) => {
        if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  async insert(data: InsertCommentData): Promise<Comment> {
    const comment: Comment = {
      id: data.id,
      postId: data.postId,
      authorId: data.authorId,
      body: data.body,
      status: "active",
      sticky: false,
      distinguished: false,
      createdAt: data.now,
      updatedAt: data.now,
      deletedAt: null,
    };
    this.rows = [...this.rows, comment];
    return comment;
  }

  private replace(next: Comment): Comment {
    this.rows = this.rows.map((r) => (r.id === next.id ? next : r));
    return next;
  }

  async update(id: string, patch: UpdateCommentData, now: Date): Promise<Comment> {
    const current = this.rows.find((r) => r.id === id);
    if (!current) throw new Error("Update matched no comment");
    return this.replace({
      ...current,
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.sticky !== undefined ? { sticky: patch.sticky } : {}),
      ...(patch.distinguished !== undefined
        ? { distinguished: patch.distinguished }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: now,
    });
  }

  async softDelete(id: string, now: Date): Promise<Comment> {
    const current = this.rows.find((r) => r.id === id);
    if (!current) throw new Error("Delete matched no comment");
    return this.replace({ ...current, status: "deleted", deletedAt: now, updatedAt: now });
  }
}

export class InMemoryReactionRepository implements ReactionRepository {
  private rows: Reaction[] = [];

  async find(postId: string, userId: string): Promise<Reaction | undefined> {
    return this.rows.find((r) => r.postId === postId && r.userId === userId);
  }

  async countByPost(postId: string): Promise<number> {
    return this.rows.filter((r) => r.postId === postId).length;
  }

  async insert(data: {
    id: string;
    postId: string;
    userId: string;
    kind: ReactionKind;
    now: Date;
  }): Promise<Reaction> {
    const reaction: Reaction = {
      id: data.id,
      postId: data.postId,
      userId: data.userId,
      kind: data.kind,
      createdAt: data.now,
    };
    this.rows = [...this.rows, reaction];
    return reaction;
  }

  async updateKind(id: string, kind: ReactionKind): Promise<Reaction> {
    const current = this.rows.find((r) => r.id === id);
    if (!current) throw new Error("Update matched no reaction");
    const next = { ...current, kind };
    this.rows = this.rows.map((r) => (r.id === id ? next : r));
    return next;
  }

  async remove(postId: string, userId: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) => !(r.postId === postId && r.userId === userId),
    );
    return this.rows.length < before;
  }
}

export class InMemoryModerationRepository implements ModerationRepository {
  private rows: ModerationEntry[] = [];

  async record(data: RecordModerationData): Promise<ModerationEntry> {
    const entry: ModerationEntry = {
      id: data.id,
      actorId: data.actorId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      reason: data.reason,
      metadata: data.metadata,
      createdAt: data.now,
    };
    this.rows = [...this.rows, entry];
    return entry;
  }

  async listByTarget(
    targetType: ModerationTargetType,
    targetId: string,
  ): Promise<ReadonlyArray<ModerationEntry>> {
    return this.rows
      .filter((r) => r.targetType === targetType && r.targetId === targetId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Test helper: full audit trail. */
  all(): ReadonlyArray<ModerationEntry> {
    return this.rows;
  }
}

export class InMemoryPostViewRepository implements PostViewRepository {
  private rows: Array<{ id: string; bucketKey: string; postId: string; viewedAt: Date }> =
    [];

  async countDistinctSince(bucketKey: string, since: Date): Promise<number> {
    const posts = new Set(
      this.rows
        .filter((r) => r.bucketKey === bucketKey && r.viewedAt.getTime() >= since.getTime())
        .map((r) => r.postId),
    );
    return posts.size;
  }

  async hasViewedSince(
    bucketKey: string,
    postId: string,
    since: Date,
  ): Promise<boolean> {
    return this.rows.some(
      (r) =>
        r.bucketKey === bucketKey &&
        r.postId === postId &&
        r.viewedAt.getTime() >= since.getTime(),
    );
  }

  async record(data: {
    id: string;
    bucketKey: string;
    postId: string;
    now: Date;
  }): Promise<void> {
    this.rows = [
      ...this.rows,
      { id: data.id, bucketKey: data.bucketKey, postId: data.postId, viewedAt: data.now },
    ];
  }
}

/** Membership reader backed by a fixed map, for tests / local dev. */
export class FakeMembershipReader implements MembershipReader {
  private readonly members: Map<string, MemberBadge>;

  constructor(members: Iterable<MemberBadge> = []) {
    this.members = new Map();
    for (const m of members) this.members.set(m.userId, m);
  }

  set(member: MemberBadge): void {
    this.members.set(member.userId, member);
  }

  async getMembership(userId: string): Promise<MemberBadge | undefined> {
    return this.members.get(userId);
  }

  async getMemberships(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, MemberBadge>> {
    const map = new Map<string, MemberBadge>();
    for (const id of userIds) {
      const m = this.members.get(id);
      if (m) map.set(id, m);
    }
    return map;
  }
}

export const makeBadge = (
  userId: string,
  overrides: Partial<MemberBadge> = {},
): MemberBadge => ({
  userId,
  tier: "member",
  displayName: null,
  isExpert: false,
  expertBadge: null,
  specialty: null,
  ...overrides,
});

export const makeDoctorBadge = (
  userId: string,
  overrides: Partial<MemberBadge> = {},
): MemberBadge =>
  makeBadge(userId, {
    tier: "verified_doctor",
    isExpert: true,
    expertBadge: "verified_doctor",
    ...overrides,
  });
