/**
 * Content Catalog application service — orchestrates the catalog use cases.
 *
 * Depends only on ports (repository, clock, id generator), so it is fully
 * unit-testable with in-memory fakes and independent of Drizzle / Express /
 * better-auth internals. Business rules (ownership, notice-authoring rights,
 * publish/hide, public visibility) live here — never in the HTTP layer.
 *
 * Contract: BBR-1144#document-entity-contract (LOCKED).
 */
import { contentNotFound, forbidden } from "./errors.js";
import type { Clock, ContentRepository, IdGenerator } from "./ports.js";
import { isPublishing } from "./state-machine.js";
import type {
  ContentItem,
  ContentQuery,
  ContentSort,
  ContentStatus,
  CreateContentInput,
  Paginated,
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
  sort: "latest",
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
  async listPublished(query: Partial<ContentQuery>): Promise<Paginated<ContentItem>> {
    return this.repo.list({
      ...DEFAULT_LIST,
      ...query,
      statuses: ["published"],
      includeDeleted: false,
    });
  }

  /** Unified content search — published, non-deleted, ranked by the repo. */
  async search(query: Partial<ContentQuery> & { q: string }): Promise<Paginated<ContentItem>> {
    return this.repo.list({
      ...DEFAULT_LIST,
      ...query,
      statuses: ["published"],
      includeDeleted: false,
    });
  }

  /**
   * Detail by id. Published content is visible to everyone; non-public statuses
   * are visible only to the author or an admin. Increments the view counter on
   * a successful public (published) read.
   */
  async getForViewer(id: string, viewer: ContentViewer): Promise<ContentItem> {
    const found = await this.repo.findById(id);
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
  async listOwned(authorId: string, query: Partial<ContentQuery>): Promise<Paginated<ContentItem>> {
    return this.repo.list({
      ...DEFAULT_LIST,
      ...query,
      authorId,
      includeDeleted: false,
    });
  }

  // --- Authoring (member) --------------------------------------------------

  /** Create a new draft owned by the author. `notice` requires an admin actor. */
  async create(input: CreateContentInput, actor: ContentActor): Promise<ContentItem> {
    if (input.category === "notice" && !actor.isAdmin) {
      throw forbidden("Only admins may author notice content.");
    }
    const id = this.ids.next();
    const now = this.clock.now();
    return this.repo.insert({ ...input, id, status: "draft", now });
  }

  /** Patch an item the actor owns (or any item when admin). */
  async update(id: string, actor: ContentActor, patch: UpdateContentInput): Promise<ContentItem> {
    const existing = await this.requireOwned(id, actor);
    if (patch.category === "notice" && !actor.isAdmin && existing.category !== "notice") {
      throw forbidden("Only admins may set the notice category.");
    }
    return this.repo.patch(id, { ...patch, updatedAt: this.clock.now() });
  }

  /** Soft delete an item the actor owns (or any item when admin). */
  async remove(id: string, actor: ContentActor): Promise<void> {
    await this.requireOwned(id, actor);
    const now = this.clock.now();
    await this.repo.patch(id, { deletedAt: now, updatedAt: now });
  }

  // --- Admin / moderation --------------------------------------------------

  async adminList(query: Partial<ContentQuery>): Promise<Paginated<ContentItem>> {
    return this.repo.list({ ...DEFAULT_LIST, ...query });
  }

  async adminGetById(id: string): Promise<ContentItem> {
    const found = await this.repo.findById(id);
    if (!found) throw contentNotFound();
    return found;
  }

  async adminUpdate(id: string, patch: UpdateContentInput): Promise<ContentItem> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    return this.repo.patch(id, { ...patch, updatedAt: this.clock.now() });
  }

  /** Moderation: publish / hide / unpublish. Stamps `publishedAt` on first publish. */
  async adminSetStatus(id: string, status: ContentStatus): Promise<ContentItem> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    const now = this.clock.now();
    return this.repo.patch(id, {
      status,
      ...(isPublishing(existing.status, status) ? { publishedAt: now } : {}),
      updatedAt: now,
    });
  }

  /** Restore a soft-deleted item (clears `deletedAt`, keeps its status). */
  async adminRestore(id: string): Promise<ContentItem> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    const now = this.clock.now();
    return this.repo.patch(id, { deletedAt: null, updatedAt: now });
  }

  async adminRemove(id: string, options: { hard?: boolean } = {}): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw contentNotFound();
    if (options.hard) {
      await this.repo.hardDelete(id);
      return;
    }
    const now = this.clock.now();
    await this.repo.patch(id, { deletedAt: now, updatedAt: now });
  }

  // --- Internals -----------------------------------------------------------

  private async requireOwned(id: string, actor: ContentActor): Promise<ContentItem> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.deletedAt) throw contentNotFound();
    if (!actor.isAdmin && existing.authorId !== actor.userId) throw forbidden();
    return existing;
  }
}

export type { ContentSort };
