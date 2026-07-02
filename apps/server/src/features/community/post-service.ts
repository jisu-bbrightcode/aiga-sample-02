/**
 * Post use cases (게시글): CRUD, detail-view with daily-view-limit enforcement,
 * and admin moderation (pin/lock/remove/restore/crosspost). Depends only on
 * ports so it is unit-testable with in-memory fakes.
 */
import { loadAuthor, loadAuthors } from "./author.js";
import {
  postLocked,
  postNotFound,
  postViewDailyLimitExceeded,
} from "./errors.js";
import { assertAdmin, assertCanParticipate, assertOwnerOrAdmin } from "./guards.js";
import type {
  Clock,
  IdGenerator,
  MembershipReader,
  ModerationRepository,
  PostRepository,
  ReactionRepository,
} from "./ports.js";
import type { PostViewLimiter } from "./view-limit-service.js";
import type {
  Actor,
  CreatePostInput,
  ListPostsQuery,
  ModerationAction,
  ModerationEntry,
  Paginated,
  Post,
  PostStatus,
  PostView,
  UpdatePostInput,
} from "./types.js";

export interface PostServiceDeps {
  readonly posts: PostRepository;
  readonly reactions: ReactionRepository;
  readonly moderation: ModerationRepository;
  readonly membership: MembershipReader;
  readonly viewLimiter: PostViewLimiter;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface PostModerationCommand {
  readonly action: Extract<
    ModerationAction,
    "pin" | "unpin" | "lock" | "unlock" | "remove" | "restore" | "crosspost"
  >;
  readonly reason: string | null;
  readonly crosspostOf?: string;
}

export interface PostModerationResult {
  readonly post: PostView;
  readonly audit: ModerationEntry;
}

export class PostService {
  private readonly deps: PostServiceDeps;

  constructor(deps: PostServiceDeps) {
    this.deps = deps;
  }

  /** Member/verified creates a post (guests => 403). */
  async create(actor: Actor, input: CreatePostInput): Promise<PostView> {
    assertCanParticipate(actor);
    const now = this.deps.clock.now();
    const post = await this.deps.posts.insert({
      id: this.deps.ids.next(),
      authorId: input.authorId,
      title: input.title,
      body: input.body,
      category: input.category,
      now,
    });
    return this.toView(post, 0);
  }

  /** Public list, visibility-filtered by caller tier (admins see moderated). */
  async list(actor: Actor, query: ListPostsQuery): Promise<Paginated<PostView>> {
    const statuses: readonly PostStatus[] = actor.isAdmin
      ? ["active", "removed"]
      : ["active"];
    const page = await this.deps.posts.list(query, statuses);
    const authors = await loadAuthors(
      this.deps.membership,
      page.items.map((p) => p.authorId),
    );
    const counts = await Promise.all(
      page.items.map((p) => this.deps.reactions.countByPost(p.id)),
    );
    return {
      ...page,
      items: page.items.map((p, i) => ({
        ...p,
        author: authors.get(p.authorId) ?? loadFallback(p.authorId),
        reactionCount: counts[i] ?? 0,
      })),
    };
  }

  /**
   * Detail view (열람). Enforces the grade-based daily view limit for the caller
   * before returning the post. `bucketKey` is derived by the controller.
   */
  async getPost(actor: Actor, id: string, bucketKey: string): Promise<PostView> {
    const post = await this.loadVisible(actor, id);

    const verdict = await this.deps.viewLimiter.recordView({
      bucketKey,
      tier: actor.tier,
      postId: post.id,
    });
    if (!verdict.allowed) throw postViewDailyLimitExceeded();

    // Only bump the persistent counter when this view was newly counted.
    let viewCount = post.viewCount;
    if (!verdict.alreadyCounted) {
      viewCount = await this.deps.posts.incrementViewCount(
        post.id,
        this.deps.clock.now(),
      );
    }
    const count = await this.deps.reactions.countByPost(post.id);
    const author = await loadAuthor(this.deps.membership, post.authorId);
    return { ...post, viewCount, author, reactionCount: count };
  }

  /** Author (or admin) edits a post. Locked posts reject non-admin edits. */
  async update(actor: Actor, id: string, patch: UpdatePostInput): Promise<PostView> {
    const post = await this.loadActive(id);
    assertOwnerOrAdmin(actor, post.authorId);
    if (post.locked && !actor.isAdmin) throw postLocked();

    const updated = await this.deps.posts.update(
      id,
      {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      },
      this.deps.clock.now(),
    );
    const count = await this.deps.reactions.countByPost(id);
    return this.toView(updated, count);
  }

  /** Author (or admin) soft-deletes a post. */
  async remove(actor: Actor, id: string): Promise<Post> {
    const post = await this.loadActive(id);
    assertOwnerOrAdmin(actor, post.authorId);
    return this.deps.posts.softDelete(id, this.deps.clock.now());
  }

  /** Admin moderation on a post (pin/lock/remove/restore/crosspost). */
  async moderate(
    actor: Actor,
    id: string,
    cmd: PostModerationCommand,
  ): Promise<PostModerationResult> {
    assertAdmin(actor);
    const post = await this.loadAny(id);
    const now = this.deps.clock.now();

    const patch = moderationPatch(cmd);
    const updated = await this.deps.posts.update(id, patch, now);

    const audit = await this.deps.moderation.record({
      id: this.deps.ids.next(),
      actorId: actor.userId,
      action: cmd.action,
      targetType: "post",
      targetId: id,
      reason: cmd.reason,
      metadata: cmd.crosspostOf ? { crosspostOf: cmd.crosspostOf } : null,
      now,
    });
    const count = await this.deps.reactions.countByPost(id);
    return { post: await this.toView(updated, count), audit };
  }

  // --- internals ------------------------------------------------------------

  private async toView(post: Post, reactionCount: number): Promise<PostView> {
    const author = await loadAuthor(this.deps.membership, post.authorId);
    return { ...post, author, reactionCount };
  }

  /** Loads a post that is 'active' (used for author edit/delete). */
  private async loadActive(id: string): Promise<Post> {
    const post = await this.deps.posts.findById(id);
    if (!post || post.status !== "active") throw postNotFound();
    return post;
  }

  /** Loads a post visible to the caller (admins also see 'removed'). */
  private async loadVisible(actor: Actor, id: string): Promise<Post> {
    const post = await this.deps.posts.findById(id);
    if (!post || post.status === "deleted") throw postNotFound();
    if (post.status === "removed" && !actor.isAdmin) throw postNotFound();
    return post;
  }

  /** Loads any non-deleted post (used for admin moderation targets). */
  private async loadAny(id: string): Promise<Post> {
    const post = await this.deps.posts.findById(id);
    if (!post || post.status === "deleted") throw postNotFound();
    return post;
  }
}

const loadFallback = (userId: string) => ({
  userId,
  displayName: null,
  tier: "member" as const,
  isExpert: false,
  expertBadge: null,
  specialty: null,
});

function moderationPatch(cmd: PostModerationCommand) {
  switch (cmd.action) {
    case "pin":
      return { pinned: true };
    case "unpin":
      return { pinned: false };
    case "lock":
      return { locked: true };
    case "unlock":
      return { locked: false };
    case "remove":
      return { status: "removed" as const };
    case "restore":
      return { status: "active" as const };
    case "crosspost":
      return { crosspostOf: cmd.crosspostOf ?? null };
  }
}
