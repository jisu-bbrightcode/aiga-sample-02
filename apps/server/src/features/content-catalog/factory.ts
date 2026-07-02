/**
 * Runtime wiring for the content catalog. Builds the service against the
 * Drizzle/Postgres repository lazily (like `getAuth()`), so importing this
 * module does not eagerly create a DB pool — keeping the pure service + domain
 * modules import-safe for unit tests.
 */
import { randomUUID } from "node:crypto";

import { getDb } from "../../db/client.js";
import { DrizzleContentRepository } from "./drizzle-repository.js";
import type { Clock, IdGenerator } from "./ports.js";
import { ContentService } from "./service.js";

export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

let contentService: ContentService | null = null;

export function getContentService(): ContentService {
  if (contentService) return contentService;
  contentService = new ContentService({
    repo: new DrizzleContentRepository(getDb()),
    clock: systemClock,
    ids: uuidGenerator,
  });
  return contentService;
}
