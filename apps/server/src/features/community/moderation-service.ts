/**
 * 관리자 콘텐츠 모더레이션 — user sanctions, keyword filters, and generic
 * content-moderation actions. Every action is admin-gated and writes an
 * immutable audit-trail entry recording the acting admin (QA M3/M4/M5/M6).
 *
 * Pin/lock/remove of posts and sticky/distinguish of comments live in the
 * post/comment services (they mutate those aggregates directly); this service
 * owns the cross-cutting moderation surface that does not belong to one resource.
 */
import { commentNotFound, postNotFound, userNotFound } from "./errors.js";
import { assertAdmin } from "./guards.js";
import type {
  Clock,
  CommentRepository,
  IdGenerator,
  MembershipReader,
  ModerationRepository,
  PostRepository,
} from "./ports.js";
import type { Actor, ModerationEntry } from "./types.js";

export interface SanctionInput {
  readonly targetUserId: string;
  readonly reason: string | null;
  readonly kind?: string;
}

export interface KeywordFilterInput {
  readonly keyword: string;
  readonly reason: string | null;
}

export interface ContentModerationInput {
  readonly targetType: "post" | "comment";
  readonly targetId: string;
  readonly action: string;
  readonly reason: string | null;
}

export interface ModerationServiceDeps {
  readonly moderation: ModerationRepository;
  readonly membership: MembershipReader;
  readonly posts: PostRepository;
  readonly comments: CommentRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class ModerationService {
  private readonly deps: ModerationServiceDeps;

  constructor(deps: ModerationServiceDeps) {
    this.deps = deps;
  }

  /** Sanction a member (mute/ban/etc). Target must exist (=> 404). */
  async sanction(actor: Actor, input: SanctionInput): Promise<ModerationEntry> {
    assertAdmin(actor);
    const target = await this.deps.membership.getMembership(input.targetUserId);
    if (!target) throw userNotFound();
    return this.deps.moderation.record({
      id: this.deps.ids.next(),
      actorId: actor.userId,
      action: "sanction",
      targetType: "user",
      targetId: input.targetUserId,
      reason: input.reason,
      metadata: input.kind ? { kind: input.kind } : null,
      now: this.deps.clock.now(),
    });
  }

  /** Register a filtered keyword (금칙어). Audit target is the keyword itself. */
  async addKeywordFilter(
    actor: Actor,
    input: KeywordFilterInput,
  ): Promise<ModerationEntry> {
    assertAdmin(actor);
    return this.deps.moderation.record({
      id: this.deps.ids.next(),
      actorId: actor.userId,
      action: "keyword_filter",
      targetType: "keyword",
      targetId: input.keyword,
      reason: input.reason,
      metadata: { keyword: input.keyword },
      now: this.deps.clock.now(),
    });
  }

  /** Generic content-moderation action against an existing post/comment. */
  async moderateContent(
    actor: Actor,
    input: ContentModerationInput,
  ): Promise<ModerationEntry> {
    assertAdmin(actor);
    await this.ensureTargetExists(input.targetType, input.targetId);
    return this.deps.moderation.record({
      id: this.deps.ids.next(),
      actorId: actor.userId,
      action: "content_moderation",
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: { action: input.action },
      now: this.deps.clock.now(),
    });
  }

  /** Read the audit trail for a target (moderation history). */
  async history(
    targetType: ModerationEntry["targetType"],
    targetId: string,
  ): Promise<ReadonlyArray<ModerationEntry>> {
    return this.deps.moderation.listByTarget(targetType, targetId);
  }

  private async ensureTargetExists(
    targetType: "post" | "comment",
    targetId: string,
  ): Promise<void> {
    if (targetType === "post") {
      const post = await this.deps.posts.findById(targetId);
      if (!post || post.status === "deleted") throw postNotFound();
      return;
    }
    const comment = await this.deps.comments.findById(targetId);
    if (!comment || comment.status === "deleted") throw commentNotFound();
  }
}
