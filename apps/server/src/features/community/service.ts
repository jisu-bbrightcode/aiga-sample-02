/**
 * Community service composition. Bundles the focused use-case services
 * (post/comment/reaction/moderation + view limiter) behind a single value the
 * controller and HTTP layer depend on. Each sub-service is independently
 * unit-testable; this module just wires them from a shared set of ports.
 */
import { CommentService } from "./comment-service.js";
import { ModerationService } from "./moderation-service.js";
import type {
  Clock,
  CommentRepository,
  IdGenerator,
  MembershipReader,
  ModerationRepository,
  PostRepository,
  PostViewRepository,
  ReactionRepository,
} from "./ports.js";
import { PostService } from "./post-service.js";
import { ReactionService } from "./reaction-service.js";
import { PostViewLimiter } from "./view-limit-service.js";

export interface CommunityPorts {
  readonly posts: PostRepository;
  readonly comments: CommentRepository;
  readonly reactions: ReactionRepository;
  readonly moderation: ModerationRepository;
  readonly views: PostViewRepository;
  readonly membership: MembershipReader;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface CommunityServices {
  readonly posts: PostService;
  readonly comments: CommentService;
  readonly reactions: ReactionService;
  readonly moderation: ModerationService;
  readonly viewLimiter: PostViewLimiter;
}

/** Build the full community service bundle from a shared set of ports. */
export function createCommunityServices(ports: CommunityPorts): CommunityServices {
  const { clock, ids, membership } = ports;

  const viewLimiter = new PostViewLimiter({ views: ports.views, clock, ids });

  const posts = new PostService({
    posts: ports.posts,
    reactions: ports.reactions,
    moderation: ports.moderation,
    membership,
    viewLimiter,
    clock,
    ids,
  });

  const comments = new CommentService({
    comments: ports.comments,
    posts: ports.posts,
    moderation: ports.moderation,
    membership,
    clock,
    ids,
  });

  const reactions = new ReactionService({
    reactions: ports.reactions,
    posts: ports.posts,
    clock,
    ids,
  });

  const moderation = new ModerationService({
    moderation: ports.moderation,
    membership,
    posts: ports.posts,
    comments: ports.comments,
    clock,
    ids,
  });

  return { posts, comments, reactions, moderation, viewLimiter };
}
