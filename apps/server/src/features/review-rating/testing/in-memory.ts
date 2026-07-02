/**
 * In-memory port implementations for unit tests and local development.
 * Immutable-friendly: rows are cloned on read/write; no external I/O.
 * Timestamps are monotonic (deterministic ordering) without a real clock.
 */
import type {
  InsertReviewData,
  MemberBadge,
  MembershipReader,
  ReviewRepository,
  UpdateReviewData,
} from "../ports.js";
import type {
  ListReviewsQuery,
  Paginated,
  RatingSummary,
  Review,
} from "../types.js";

let seq = 0;
const nextId = (): string => `review-${++seq}`;
const nextTime = (): Date => new Date(Date.UTC(2026, 0, 1, 0, 0, ++seq));

const emptyDistribution = (): Record<"1" | "2" | "3" | "4" | "5", number> => ({
  "1": 0,
  "2": 0,
  "3": 0,
  "4": 0,
  "5": 0,
});

export class InMemoryReviewRepository implements ReviewRepository {
  private rows: Review[] = [];

  async findById(id: string): Promise<Review | undefined> {
    return this.rows.find((r) => r.id === id);
  }

  async findActiveByAuthorAndTarget(
    authorId: string,
    targetUserId: string,
  ): Promise<Review | undefined> {
    return this.rows.find(
      (r) =>
        r.status === "active" &&
        r.authorId === authorId &&
        r.targetUserId === targetUserId,
    );
  }

  async listActiveByTarget(query: ListReviewsQuery): Promise<Paginated<Review>> {
    const filtered = this.rows.filter(
      (r) => r.status === "active" && r.targetUserId === query.targetUserId,
    );
    const sorted = [...filtered].sort((a, b) => {
      if (query.sort === "rating_desc") {
        return b.rating - a.rating || b.createdAt.getTime() - a.createdAt.getTime();
      }
      if (query.sort === "rating_asc") {
        return a.rating - b.rating || b.createdAt.getTime() - a.createdAt.getTime();
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

  async summarize(targetUserId: string): Promise<RatingSummary> {
    const active = this.rows.filter(
      (r) => r.status === "active" && r.targetUserId === targetUserId,
    );
    const distribution = emptyDistribution();
    let weighted = 0;
    for (const r of active) {
      const key = String(r.rating) as "1" | "2" | "3" | "4" | "5";
      if (key in distribution) distribution[key] += 1;
      weighted += r.rating;
    }
    const total = active.length;
    return {
      targetUserId,
      count: total,
      average: total === 0 ? null : Math.round((weighted / total) * 100) / 100,
      distribution,
    };
  }

  async insert(data: InsertReviewData): Promise<Review> {
    const now = nextTime();
    const review: Review = {
      id: nextId(),
      targetUserId: data.targetUserId,
      authorId: data.authorId,
      rating: data.rating,
      title: data.title,
      body: data.body,
      status: "active",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.rows = [...this.rows, review];
    return review;
  }

  private replace(next: Review): Review {
    this.rows = this.rows.map((r) => (r.id === next.id ? next : r));
    return next;
  }

  async update(id: string, patch: UpdateReviewData): Promise<Review> {
    const current = this.rows.find((r) => r.id === id && r.status === "active");
    if (!current) throw new Error("Update matched no active review");
    return this.replace({
      ...current,
      ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      updatedAt: nextTime(),
    });
  }

  async softDelete(id: string): Promise<Review> {
    const current = this.rows.find((r) => r.id === id && r.status === "active");
    if (!current) throw new Error("Delete matched no active review");
    const now = nextTime();
    return this.replace({
      ...current,
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
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

/** Convenience factory for a member badge with sensible defaults. */
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

/** A verified-doctor badge (expert, 전문가 뱃지). */
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
