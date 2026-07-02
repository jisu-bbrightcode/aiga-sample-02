import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DoctorVerificationError } from '../../src/features/doctor-verification/errors.js';
import {
  assertCanReapply,
  assertCanSubmit,
  assertReviewable,
  canReapply,
  isActive,
} from '../../src/features/doctor-verification/state-machine.js';
import type {
  VerificationApplication,
  VerificationStatus,
} from '../../src/features/doctor-verification/types.js';

const appWith = (status: VerificationStatus): VerificationApplication => ({
  id: 'app-1',
  applicantId: 'user-1',
  status,
  license: { licenseNumber: '123', licenseName: 'Kim', specialty: null },
  proofDocuments: [],
  rejectionReason: status === 'rejected' ? 'blurry scan' : null,
  reviewedByAdminId: status === 'pending' ? null : 'admin-1',
  reviewedAt: status === 'pending' ? null : new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

const codeOf = (fn: () => void): string => {
  try {
    fn();
    return 'NO_THROW';
  } catch (e) {
    return e instanceof DoctorVerificationError ? e.code : 'WRONG_ERROR';
  }
};

describe('isActive', () => {
  it('treats pending and approved as active, rejected as inactive', () => {
    assert.equal(isActive('pending'), true);
    assert.equal(isActive('approved'), true);
    assert.equal(isActive('rejected'), false);
  });
});

describe('assertCanSubmit', () => {
  it('allows first submission when no prior application', () => {
    assert.equal(assertCanSubmit(undefined), 'submitted');
  });
  it('allows resubmission after rejection', () => {
    assert.equal(assertCanSubmit(appWith('rejected')), 'resubmitted');
  });
  it('blocks when a pending application exists', () => {
    assert.equal(codeOf(() => assertCanSubmit(appWith('pending'))), 'ACTIVE_APPLICATION_EXISTS');
  });
  it('blocks when already approved', () => {
    assert.equal(codeOf(() => assertCanSubmit(appWith('approved'))), 'ALREADY_VERIFIED');
  });
});

describe('assertCanReapply', () => {
  it('requires a prior application', () => {
    assert.equal(codeOf(() => assertCanReapply(undefined)), 'CANNOT_REAPPLY');
  });
  it('rejects reapply when pending', () => {
    assert.equal(codeOf(() => assertCanReapply(appWith('pending'))), 'ACTIVE_APPLICATION_EXISTS');
  });
  it('rejects reapply when approved', () => {
    assert.equal(codeOf(() => assertCanReapply(appWith('approved'))), 'ALREADY_VERIFIED');
  });
  it('allows reapply after rejection', () => {
    assert.equal(codeOf(() => assertCanReapply(appWith('rejected'))), 'NO_THROW');
  });
});

describe('assertReviewable', () => {
  it('allows reviewing a pending application', () => {
    assert.equal(codeOf(() => assertReviewable(appWith('pending'))), 'NO_THROW');
  });
  it('blocks reviewing an already-decided application', () => {
    assert.equal(codeOf(() => assertReviewable(appWith('approved'))), 'NOT_REVIEWABLE');
    assert.equal(codeOf(() => assertReviewable(appWith('rejected'))), 'NOT_REVIEWABLE');
  });
});

describe('canReapply', () => {
  it('is true with no application or after rejection, false otherwise', () => {
    assert.equal(canReapply(undefined), true);
    assert.equal(canReapply(appWith('rejected')), true);
    assert.equal(canReapply(appWith('pending')), false);
    assert.equal(canReapply(appWith('approved')), false);
  });
});
