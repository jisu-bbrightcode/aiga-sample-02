/**
 * Reaction / 추천 use cases (반응): idempotent cast + remove. At most one active
 * reaction per (post, user); re-casting the same kind is a no-op (idempotent
 * 200), switching kinds updates in place, and removing decrements the count.
 */
import { postNotFound } from "./errors.js";
import { assertCanParticipate } from "./guards.js";
import type {
  Clock,
  IdGenerator,
  PostRepository,
  ReactionRepository,
} from "./ports.js";
import type { Actor, ReactionKind, ReactionResult } from "./types.js";

export interface ReactionServiceDeps {
  readonly reactions: ReactionRepository;
  readonly posts: PostRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class ReactionService {
  private readonly deps: ReactionServiceDeps;

  constructor(deps: ReactionServiceDeps) {
    this.deps = deps;
  }

  /** Cast (or re-cast) a reaction. Idempotent: same kind => no double count. */
  async cast(
    actor: Actor,
    postId: string,
    kind: ReactionKind,
  ): Promise<ReactionResult> {
    assertCanParticipate(actor);
    const userId = actor.userId as string; // guaranteed by assertCanParticipate
    await this.ensureActivePost(postId);

    const existing = await this.deps.reactions.find(postId, userId);
    let changed = false;
    let effectiveKind: ReactionKind = kind;
    if (!existing) {
      await this.deps.reactions.insert({
        id: this.deps.ids.next(),
        postId,
        userId,
        kind,
        now: this.deps.clock.now(),
      });
      changed = true;
    } else if (existing.kind !== kind) {
      await this.deps.reactions.updateKind(existing.id, kind);
      changed = true;
    } else {
      effectiveKind = existing.kind; // idempotent re-cast
    }

    const reactionCount = await this.deps.reactions.countByPost(postId);
    return { postId, userId, kind: effectiveKind, reactionCount, changed };
  }

  /** Remove the caller's reaction (idempotent). */
  async remove(actor: Actor, postId: string): Promise<ReactionResult> {
    assertCanParticipate(actor);
    const userId = actor.userId as string;
    await this.ensureActivePost(postId);

    const changed = await this.deps.reactions.remove(postId, userId);
    const reactionCount = await this.deps.reactions.countByPost(postId);
    return { postId, userId, kind: null, reactionCount, changed };
  }

  private async ensureActivePost(postId: string): Promise<void> {
    const post = await this.deps.posts.findById(postId);
    if (!post || post.status !== "active") throw postNotFound();
  }
}
