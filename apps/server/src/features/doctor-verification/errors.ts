/**
 * Typed domain errors. Each carries a stable `code` and an HTTP `status`
 * so the controller adapter can map them to REST responses without leaking
 * internal detail (see security rules: error messages must not leak PII).
 */

export type DoctorVerificationErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'ACTIVE_APPLICATION_EXISTS'
  | 'ALREADY_VERIFIED'
  | 'NOT_REVIEWABLE'
  | 'CANNOT_REAPPLY'
  | 'FORBIDDEN';

export class DoctorVerificationError extends Error {
  readonly code: DoctorVerificationErrorCode;
  readonly status: number;

  constructor(code: DoctorVerificationErrorCode, status: number, message: string) {
    super(message);
    this.name = 'DoctorVerificationError';
    this.code = code;
    this.status = status;
  }
}

export const applicationNotFound = () =>
  new DoctorVerificationError('APPLICATION_NOT_FOUND', 404, 'Verification application not found.');

export const activeApplicationExists = () =>
  new DoctorVerificationError(
    'ACTIVE_APPLICATION_EXISTS',
    409,
    'An active verification application already exists for this applicant.',
  );

export const alreadyVerified = () =>
  new DoctorVerificationError('ALREADY_VERIFIED', 409, 'Applicant is already verified.');

export const notReviewable = () =>
  new DoctorVerificationError(
    'NOT_REVIEWABLE',
    409,
    'Only pending applications can be reviewed.',
  );

export const cannotReapply = () =>
  new DoctorVerificationError(
    'CANNOT_REAPPLY',
    409,
    'Re-application is only allowed after a rejection.',
  );

export const forbidden = () =>
  new DoctorVerificationError('FORBIDDEN', 403, 'Not permitted to access this application.');
