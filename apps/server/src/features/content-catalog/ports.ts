/**
 * Integration ports — the seam between the content service and persistence /
 * environment. Keeping persistence behind a narrow interface lets the service
 * be unit-tested with in-memory fakes (see `testing/in-memory.ts`) and swapped
 * to the Drizzle/Postgres implementation in production without code changes.
 */
import type {
  ContentItem,
  ContentQuery,
  ContentStatus,
  CreateContentInput,
  Paginated,
  UpdateContentInput,
} from "./types.js";

/** Fields the repository sets on insert (author-supplied + defaults). */
export interface InsertContentData extends CreateContentInput {
  readonly id: string;
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
  findById(id: string): Promise<ContentItem | undefined>;
  list(query: ContentQuery): Promise<Paginated<ContentItem>>;
  insert(data: InsertContentData): Promise<ContentItem>;
  patch(id: string, data: PatchContentData): Promise<ContentItem>;
  /** Atomically increment the view counter. */
  incrementViewCount(id: string): Promise<void>;
  /** Hard delete (admin only). Soft delete is done via `patch(deletedAt)`. */
  hardDelete(id: string): Promise<void>;
}

/** Deterministic time source (injected so tests are stable). */
export interface Clock {
  now(): Date;
}

/** Id generator (injected so tests are stable). */
export interface IdGenerator {
  next(): string;
}
