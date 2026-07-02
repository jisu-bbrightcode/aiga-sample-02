/**
 * Runtime wiring for the content catalog. Builds the services against the
 * Drizzle/Postgres repositories lazily (like `getAuth()`), so importing this
 * module does not eagerly create a DB pool — keeping the pure service + domain
 * modules import-safe for unit tests.
 */
import { randomUUID } from "node:crypto";

import { getDb } from "../../db/client.js";
import { DrizzleCategoryRepository, DrizzleContentRepository } from "./drizzle-repository.js";
import type { Clock, IdGenerator } from "./ports.js";
import { CategoryService, ContentService } from "./service.js";

export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

let contentService: ContentService | null = null;
let categoryService: CategoryService | null = null;

export function getContentService(): ContentService {
  if (contentService) return contentService;
  contentService = new ContentService({
    repo: new DrizzleContentRepository(getDb()),
    clock: systemClock,
    ids: uuidGenerator,
  });
  return contentService;
}

export function getCategoryService(): CategoryService {
  if (categoryService) return categoryService;
  categoryService = new CategoryService({
    repo: new DrizzleCategoryRepository(getDb()),
    clock: systemClock,
    ids: uuidGenerator,
  });
  return categoryService;
}
