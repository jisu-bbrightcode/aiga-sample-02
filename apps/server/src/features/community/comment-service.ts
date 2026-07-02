/**
 * Comment use cases (댓글): CRUD plus admin moderation (sticky/distinguish/remove).
 * Commenting requires community participation and a visible, unlocked post.
 */
import { loadAuthor, loadAuthors } from "./author.js";
import {
  commentNotFound,
  postLocked,
  postNotFound,
} from "./errors.js";
import { assertAdmin, assertCanParticipate, assertOwnerOrAdmin } from "./guards.js";
import type {
  Clock,
  CommentRepository,
  IdGenerator,
  MembershipReader,
  ModerationRepository,
  PostRepository,
} from "./ports.js";
import type {
  Actor,
  Comment,
  CommentView,
  CreateCommentInput,
  ModerationAction,
  ModerationEntry,
} from "./types.js";

export type CommentModerationAction =
  | "sticky"
  | "unsticky"
  | "distinguish"
  | "undistinguish"
  | "remove";

export interface CommentModerationResult {
  readonly comment: CommentView;
  readonly audit: ModerationEntry;
}

export interface CommentServiceDeps {
  readonly comments: CommentRepository;
  readonly posts: PostRepository;
  readonly moderation: ModerationRepository;
  readonly membership: MembershipReader;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class CommentService {
  private readonly deps: CommentServiceDeps;

  constructor(deps: CommentServiceDeps) {
    this.deps = deps;
  }

  /** Member/verified comments on a post (guest => 403, missing post => 404). */
  async create(actor: Actor, input: CreateCommentInput): Promise<CommentView> {
    assertCanParticipate(actor);
    const post = await this.deps.posts.findById(input.postId);
    if (!post || post.status !== "active") throw postNotFound();
    if (post.locked && !actor.isAdmin) throw postLocked();

    const comment = await this.deps.comments.insert({
      id: this.deps.ids.next(),
      postId: input.postId,
      authorId: input.authorId,
      body: input.body,
      now: this.deps.clock.now(),
    });
    return this.toView(comment);
  }

  /** Public: active comments for a post (post must be visible). */
  async listByPost(postId: string): Promise<ReadonlyArray<CommentView>> {
    const post = await this.deps.posts.findById(postId);
    if (!post || post.status === "deleted") throw postNotFound();

    const rows = (await this.deps.comments.listByPost(postId)).filter(
      (c) => c.status === "active",
    );
    const authors = await loadAuthors(
      this.deps.membership,
      rows.map((c) => c.authorId),
    );
    return rows.map((c) => ({
      ...c,
      author: authors.get(c.authorId) ?? fallback(c.authorId),
    }));
  }

  /** Author (or admin) edits own comment. */
  async update(actor: Actor, id: string, body: string): Promise<CommentView> {
    const comment = await this.loadActive(id);
    assertOwnerOrAdmin(actor, comment.authorId);
    const updated = await this.deps.comments.update(id, { body }, this.deps.clock.now());
    return this.toView(updated);
  }

  /** Author (or admin) deletes own comment. */
  async remove(actor: Actor, id: string): Promise<Comment> {
    const comment = await this.loadActive(id);
    assertOwnerOrAdmin(actor, comment.authorId);
    return this.deps.comments.softDelete(id, this.deps.clock.now());
  }

  /** Admin moderation (sticky/distinguish/remove) — records audit. */
  async moderate(
    actor: Actor,
    id: string,
    action: CommentModerationAction,
    reason: string | null,
  ): Promise<CommentModerationResult> {
    assertAdmin(actor);
    const comment = await this.loadAny(id);
    const now = this.deps.clock.now();
    const updated = await this.deps.comments.update(id, patchFor(action), now);
    const audit = await this.deps.moderation.record({
      id: this.deps.ids.next(),
      actorId: actor.userId,
      action: auditActionFor(action),
      targetType: "comment",
      targetId: id,
      reason,
      metadata: { action },
      now,
    });
    return { comment: await this.toView(updated), audit };
  }

  // --- internals ------------------------------------------------------------

  private async toView(comment: Comment): Promise<CommentView> {
    const author = await loadAuthor(this.deps.membership, comment.authorId);
    return { ...comment, author };
  }

  private async loadActive(id: string): Promise<Comment> {
    const comment = await this.deps.comments.findById(id);
    if (!comment || comment.status !== "active") throw commentNotFound();
    return comment;
  }

  private async loadAny(id: string): Promise<Comment> {
    const comment = await this.deps.comments.findById(id);
    if (!comment || comment.status === "deleted") throw commentNotFound();
    return comment;
  }
}

const fallback = (userId: string) => ({
  userId,
  displayName: null,
  tier: "member" as const,
  isExpert: false,
  expertBadge: null,
  specialty: null,
});

function patchFor(action: CommentModerationAction) {
  switch (action) {
    case "sticky":
      return { sticky: true };
    case "unsticky":
      return { sticky: false };
    case "distinguish":
      return { distinguished: true };
    case "undistinguish":
      return { distinguished: false };
    case "remove":
      return { status: "removed" as const };
  }
}

/** Map a comment moderation action to its audit-trail action code. */
function auditActionFor(action: CommentModerationAction): ModerationAction {
  switch (action) {
    case "sticky":
    case "unsticky":
      return "comment_sticky";
    case "distinguish":
    case "undistinguish":
      return "comment_distinguish";
    case "remove":
      return "remove";
  }
}
