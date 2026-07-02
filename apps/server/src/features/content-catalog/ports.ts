/**
 * Integration ports — the seam between the content service and persistence /
 * environment. Keeping persistence behind a narrow interface lets the service
 * be unit-tested with in-memory fakes (see `testing/in-memory.ts`) and swapped
 * to the Drizzle/Postgres implementation in production without code changes.
 */
import type {
  Category,
  Content,
  ContentQuery,
  CreateCategoryInput,
  CreateContentInput,
  ContentStatus,
  Paginated,
  UpdateCategoryInput,
  UpdateContentInput,
} from "./types.js";

/** Fields the repository sets on insert (author-supplied + defaults). */
export interface InsertContentData extends CreateContentInput {
  readonly id: string;
  readonly slug: string;
  readonly status: ContentStatus;
  readonly now: Date;
}

/** Mutation applied to an existing row; only present keys are changed. */
export interface PatchContentData extends UpdateContentInput {
  readonly status?: ContentStatus;
  readonly publishedAt?: Date | null;
  readonly deletedAt?: Date | null;
  readonly updatedAt: Date;
}

export interface ContentRepository {
  findById(id: string): Promise<Content | undefined>;
  findBySlug(slug: string): Promise<Content | undefined>;
  list(query: ContentQuery): Promise<Paginated<Content>>;
  insert(data: InsertContentData): Promise<Content>;
  patch(id: string, data: PatchContentData): Promise<Content>;
  /** Atomically increment the view counter; best-effort, returns new count. */
  incrementViewCount(id: string): Promise<void>;
  /** Hard delete (admin only). Soft delete is done via `patch(deletedAt)`. */
  hardDelete(id: string): Promise<void>;
}

export interface InsertCategoryData extends CreateCategoryInput {
  readonly id: string;
  readonly now: Date;
}

export interface PatchCategoryData extends UpdateCategoryInput {
  readonly updatedAt: Date;
}

export interface CategoryRepository {
  findById(id: string): Promise<Category | undefined>;
  findBySlug(slug: string): Promise<Category | undefined>;
  list(): Promise<readonly Category[]>;
  insert(data: InsertCategoryData): Promise<Category>;
  patch(id: string, data: PatchCategoryData): Promise<Category>;
  delete(id: string): Promise<void>;
}

/** Deterministic time source (injected so tests are stable). */
export interface Clock {
  now(): Date;
}

/** Id generator (injected so tests are stable). */
export interface IdGenerator {
  next(): string;
}
