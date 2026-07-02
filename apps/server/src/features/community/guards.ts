/**
 * Shared authorization guards for the community services. Kept pure and tiny so
 * every service enforces participation/admin/ownership consistently and the QA
 * permission matrix (BBR-1134) has one place to assert against.
 */
import { resolvePolicy } from "../../membership/policy.js";
import { adminRequired, forbidden, participationForbidden } from "./errors.js";
import type { Actor } from "./types.js";

/**
 * 커뮤니티 참여 권한 — a caller may create posts/comments/reactions only if their
 * tier's policy allows community participation (guests => 403). This mirrors the
 * `requireTier('member')` HTTP guard but lives in the service so controller-level
 * QA tests (which bypass Express) get the same 403 semantics.
 */
export function assertCanParticipate(actor: Actor): void {
  if (!resolvePolicy(actor.tier).canParticipateCommunity || !actor.userId) {
    throw participationForbidden();
  }
}

/** Moderation surface requires an admin actor (관리자 전용). */
export function assertAdmin(actor: Actor): asserts actor is Actor & { userId: string } {
  if (!actor.isAdmin || !actor.userId) throw adminRequired();
}

/** Owner-or-admin gate for edit/delete of user-authored resources. */
export function assertOwnerOrAdmin(actor: Actor, ownerId: string): void {
  if (actor.isAdmin) return;
  if (actor.userId && actor.userId === ownerId) return;
  throw forbidden();
}

/**
 * Bucket key for the daily post-view limit. Authenticated callers bucket by
 * user id; anonymous callers bucket by client IP (x-forwarded-for first),
 * giving independent per-IP guest buckets (QA V6).
 */
export function viewBucketKey(actor: Actor): string {
  if (actor.userId) return `user:${actor.userId}`;
  return `ip:${actor.ip ?? "unknown"}`;
}
