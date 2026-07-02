/**
 * Content Catalog application services — orchestrate the catalog use cases.
 *
 * Depend only on ports (repositories, clock, id generator), so they are fully
 * unit-testable with in-memory fakes and independent of Drizzle / Express /
 * better-auth internals. Business rules (ownership, slug uniqueness, status
 * transitions, public visibility) live here — never in the HTTP layer.
 */
import {
  categoryNotFound,
  contentNotFound,
  forbidden,
  slugConflict,
} from "./errors.js";
import type {
  CategoryRepository,
  Clock,
  ContentRepository,
  IdGenerator,
} from "./ports.js";
import { assertTransition, isPublishing } from "./state-machine.js";
import { deriveSlug } from "./slug.js";
import type {
  Category,
  Content,
  ContentQuery,
  ContentSort,
  ContentStatus,
  CreateCategoryInput,
  CreateContentInput,
  Paginated,
  UpdateCategoryInput,
  UpdateContentInput,
} from "./types.js";

/** Who is performing a mutating action. `isAdmin` grants moderation rights. */
export interface ContentActor {
  readonly userId: string;
  readonly isAdmin: boolean;
}

/** Who is reading. Anonymous guests pass `userId: null, isAdmin: false`. */
export interface ContentViewer {
  readonly userId: string | null;
  readonly isAdmin: boolean;
}

export interface ContentServiceDeps {
  readonly repo: ContentRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const DEFAULT_LIST: Pick<ContentQuery, "sort" | "page" | "pageSize"> = {
  sort: "newest",
  page: 1,
  pageSize: 20,
};

export class ContentService {
  private readonly repo: ContentRepository;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(deps: ContentServiceDeps) {
    this.repo = deps.repo;
    this.clock = deps.clock;
    this.ids = deps.ids;
  }

  // --- Public reads --------------------------------------------------------

  /** Public catalog list — published, non-deleted only. */
  async listPublished(query: Partial<ContentQuery>): Promise<Paginated<Content>> {
    return this.repo.list({
      ...DEFAULT_LIST,
      ...query,
      statuses: ["published"],
      includeDeleted: false,
    });
  }

  /** Unified search — published, non-deleted, ranked by the repo. */
  async search(query: Partial<ContentQuery> & { q: string }): Promise<Paginated<Content>> {
    return this.repo.list({
      ...DEFAULT_LIST,
      ...query,
      statuses: ["published"],
      includeDeleted: false,
    });
  }

  /**
   * Detail by id or slug. Published content is visible to everyone; non-public
   * statuses are visible only to the author or an admin. Increments the view
   * counter on a successful public (published) read.
   */
  async getForViewer(idOrSlug: string, viewer: ContentViewer): Promise<Content> {
    const found = await this.resolve(idOrSlug);
    if (!found || found.deletedAt) throw contentNotFound();

    const isOwner = viewer.userId !== null && viewer.userId === found.authorId;
    const isPublic = found.status === "published";
    if (!isPublic && !isOwner && !viewer.isAdmin) throw contentNotFound();

    if (isPublic) {
      await this.repo.incrementViewCount(found.id);
      return { ...found, viewCount: found.viewCount + 1 };
    }
    return found;
  }

  /** A member's own items across all statuses (not soft-deleted). */
  async listOwned(authorId: string, query: Partial<ContentQuery>): Promise<Paginated<Content>> {
    return this.repo.list({
      ...DEFAULT_LIST,
      ...query,
      authorId,
      includeDeleted: false,
    });
  }

  // --- Authoring (member) --------------------------------------------------

  /** Create a new draft owned by the author. */
  async create(input: CreateContentInput): Promise<Content> {
    const id = this.ids.next();
    const slug = await this.resolveNewSlug(input.slug, input.title, id);
    const now = this.clock.now();

    return this.repo.insert({
      ...input,
      id,
      slug,
      status: "draft",
      now,
    });
  }

  /** Patch an item the actor owns (or any item when admin). */
  async update(id: string, actor: ContentActor, patch: UpdateContentInput): Promise<Content> {
    const existing = await this.requireOwned(id, actor);
    const slug = await this.resolveSlugChange(patch.slug, existing);

    return this.repo.patch(id, {
      ...patch,
      ...(slug !== undefined ? { slug } : {}),
      updatedAt: this.clock.now(),
    });
  }

  /** Author submits a draft/rejected item for moderation. */
  async submitForReview(id: string, actor: ContentActor): Promise<Content> {
    const existing = await this.requireOwned(id, actor);
    assertTransition(existing.status, "pending_review");
    return this.repo.patch(id, {
      status: "pending_review",
      updatedAt: this.clock.now(),
    });
  }

  /** Soft delete an item the actor owns (or any item when admin). */
  async remove(id: string, actor: ContentActor): Promise<void> {
    await this.requireOwned(id, actor);
    await this.repo.patch(id, {
      deletedAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  // --- Admin / moderation --------------------------------------------------

  async adminList(query: Partial<ContentQuery>): Promise<Paginated<Content>> {
    return this.repo.list({ ...DEFAULT_LIST, ...query });
  }

  async adminGetById(id: string): Promise<Content> {
    const found = await this.repo.findById(id);
    if (!found) throw contentNotFound();
    return found;
  }

  async adminUpdate(id: string, patch: UpdateContentInput): Promise<Content> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    const slug = await this.resolveSlugChange(patch.slug, existing);
    return this.repo.patch(id, {
      ...patch,
      ...(slug !== undefined ? { slug } : {}),
      updatedAt: this.clock.now(),
    });
  }

  /** Moderation: move an item to a new status, enforcing the state machine. */
  async adminSetStatus(id: string, status: ContentStatus): Promise<Content> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    assertTransition(existing.status, status);
    const now = this.clock.now();
    return this.repo.patch(id, {
      status,
      ...(isPublishing(existing.status, status) ? { publishedAt: now } : {}),
      updatedAt: now,
    });
  }

  async adminRemove(id: string, options: { hard?: boolean } = {}): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    if (options.hard) {
      await this.repo.hardDelete(id);
      return;
    }
    await this.repo.patch(id, {
      deletedAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  // --- Internals -----------------------------------------------------------

  private async resolve(idOrSlug: string): Promise<Content | undefined> {
    return (await this.repo.findById(idOrSlug)) ?? (await this.repo.findBySlug(idOrSlug));
  }

  private async requireOwned(id: string, actor: ContentActor): Promise<Content> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.deletedAt) throw contentNotFound();
    if (!actor.isAdmin && existing.authorId !== actor.userId) throw forbidden();
    return existing;
  }

  private async resolveNewSlug(
    requested: string | undefined,
    title: string,
    id: string,
  ): Promise<string> {
    if (requested) {
      if (await this.repo.findBySlug(requested)) throw slugConflict(requested);
      return requested;
    }
    const base = deriveSlug(title, id);
    if (!(await this.repo.findBySlug(base))) return base;
    return `${base}-${id.slice(0, 8)}`;
  }

  private async resolveSlugChange(
    requested: string | undefined,
    existing: Content,
  ): Promise<string | undefined> {
    if (requested === undefined || requested === existing.slug) return undefined;
    const clash = await this.repo.findBySlug(requested);
    if (clash && clash.id !== existing.id) throw slugConflict(requested);
    return requested;
  }
}

export interface CategoryServiceDeps {
  readonly repo: CategoryRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class CategoryService {
  private readonly repo: CategoryRepository;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(deps: CategoryServiceDeps) {
    this.repo = deps.repo;
    this.clock = deps.clock;
    this.ids = deps.ids;
  }

  /** All categories, ordered by sortOrder then name (repo-defined). */
  async list(): Promise<readonly Category[]> {
    return this.repo.list();
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    if (await this.repo.findBySlug(input.slug)) throw slugConflict(input.slug);
    return this.repo.insert({ ...input, id: this.ids.next(), now: this.clock.now() });
  }

  async update(id: string, patch: UpdateCategoryInput): Promise<Category> {
    const existing = await this.repo.findById(id);
    if (!existing) throw categoryNotFound();
    if (patch.slug && patch.slug !== existing.slug) {
      const clash = await this.repo.findBySlug(patch.slug);
      if (clash && clash.id !== id) throw slugConflict(patch.slug);
    }
    return this.repo.patch(id, { ...patch, updatedAt: this.clock.now() });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw categoryNotFound();
    await this.repo.delete(id);
  }
}

export type { ContentSort };
