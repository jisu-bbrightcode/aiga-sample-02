/**
 * Pure state-machine for content lifecycle. No I/O; fully unit-testable.
 *
 *   draft ──submit──▶ pending_review ──approve──▶ published
 *     ▲                    │  │                       │
 *     └──────reject────────┘  └────to draft───────────┘
 *   (any) ──▶ archived ──restore──▶ draft/published
 *
 * The service enforces these transitions so the moderation workflow cannot be
 * short-circuited by the HTTP layer.
 */
import type { ContentStatus } from "./types.js";
import { invalidStatusTransition } from "./errors.js";

export const CONTENT_STATUS_TRANSITIONS: Readonly<
  Record<ContentStatus, readonly ContentStatus[]>
> = Object.freeze({
  draft: ["pending_review", "published", "archived"],
  pending_review: ["published", "rejected", "draft", "archived"],
  published: ["archived", "draft"],
  archived: ["draft", "published"],
  rejected: ["draft", "pending_review", "archived"],
});

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  if (from === to) return true;
  return CONTENT_STATUS_TRANSITIONS[from].includes(to);
}

/** Throws a typed domain error when a status transition is not allowed. */
export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransition(from, to)) throw invalidStatusTransition(from, to);
}

/** Whether entering `status` should stamp `publishedAt`. */
export function isPublishing(from: ContentStatus, to: ContentStatus): boolean {
  return to === "published" && from !== "published";
}
