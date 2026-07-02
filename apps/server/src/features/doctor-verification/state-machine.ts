/**
 * Pure state-machine for doctor verification. No I/O, fully unit-testable.
 *
 * States: pending -> approved (terminal) | rejected
 *         rejected -> (new application) pending   [re-application]
 *         approved is terminal.
 *
 * Invariant: an applicant has at most one non-rejected application at a time
 * (enforced in DB by a partial unique index; validated here before writes).
 */
import type { VerificationApplication, VerificationStatus } from './types.js';
import { activeApplicationExists, alreadyVerified, cannotReapply, notReviewable } from './errors.js';

const ACTIVE_STATUSES: ReadonlySet<VerificationStatus> = new Set(['pending', 'approved']);

export const isActive = (status: VerificationStatus): boolean => ACTIVE_STATUSES.has(status);

/**
 * Guard for a first-time or repeat submission given the applicant's latest
 * application (undefined when none exists). Throws a typed domain error when
 * submission is not allowed; returns the event type to record otherwise.
 */
export const assertCanSubmit = (
  latest: VerificationApplication | undefined,
): 'submitted' | 'resubmitted' => {
  if (!latest) return 'submitted';
  if (latest.status === 'approved') throw alreadyVerified();
  if (latest.status === 'pending') throw activeApplicationExists();
  // latest.status === 'rejected' -> re-application allowed.
  return 'resubmitted';
};

/** Guard for an explicit re-apply command (must follow a rejection). */
export const assertCanReapply = (latest: VerificationApplication | undefined): void => {
  if (!latest) throw cannotReapply();
  if (latest.status === 'approved') throw alreadyVerified();
  if (latest.status === 'pending') throw activeApplicationExists();
};

/** Guard for an admin review action; only pending applications are reviewable. */
export const assertReviewable = (application: VerificationApplication): void => {
  if (application.status !== 'pending') throw notReviewable();
};

/** Whether the applicant may submit a new application right now. */
export const canReapply = (latest: VerificationApplication | undefined): boolean =>
  !latest || latest.status === 'rejected';
