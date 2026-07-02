/**
 * Content lifecycle helpers. No I/O; fully unit-testable.
 *
 * The locked contract collapses the old moderation machine
 * (`draft → pending_review → published → archived/rejected`) into three free
 * statuses `draft | published | hidden`. An admin publishes, hides or
 * unpublishes directly, so there is no multi-step transition to gate — only the
 * `publishedAt` stamp needs a rule.
 */
import type { ContentStatus } from "./types.js";

/** Whether moving `from → to` is the first entry into `published`. */
export function isPublishing(from: ContentStatus, to: ContentStatus): boolean {
  return to === "published" && from !== "published";
}
