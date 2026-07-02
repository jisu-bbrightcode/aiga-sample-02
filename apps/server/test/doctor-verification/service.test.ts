import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { DoctorVerificationError } from '../../src/features/doctor-verification/errors.js';
import { DoctorVerificationService } from '../../src/features/doctor-verification/service.js';
import {
  DirectTransactor,
  FakeMembershipService,
  FixedClock,
  InMemoryRepository,
} from '../../src/features/doctor-verification/testing/in-memory.js';
import type { SubmitApplicationInput } from '../../src/features/doctor-verification/types.js';

const submitInput = (applicantId: string): SubmitApplicationInput => ({
  applicantId,
  license: { licenseNumber: '2024-0001', licenseName: '홍길동', specialty: '내과' },
  proofDocuments: [{ key: 'blob/abc', filename: 'license.pdf', contentType: 'application/pdf' }],
});

const codeOfAsync = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
    return 'NO_THROW';
  } catch (e) {
    return e instanceof DoctorVerificationError ? e.code : 'WRONG_ERROR';
  }
};

describe('DoctorVerificationService', () => {
  let repo: InMemoryRepository;
  let membership: FakeMembershipService;
  let service: DoctorVerificationService;

  beforeEach(() => {
    repo = new InMemoryRepository();
    membership = new FakeMembershipService();
    service = new DoctorVerificationService({
      repo,
      membership,
      transactor: new DirectTransactor({ repo, membership }),
      clock: new FixedClock(),
    });
  });

  it('submits a first application as pending and records a submitted event', async () => {
    const app = await service.submit(submitInput('user-1'));
    assert.equal(app.status, 'pending');
    assert.equal(app.applicantId, 'user-1');
    assert.equal(repo.events.length, 1);
    assert.equal(repo.events[0]!.type, 'submitted');
  });

  it('rejects a second submission while one is pending', async () => {
    await service.submit(submitInput('user-1'));
    assert.equal(
      await codeOfAsync(() => service.submit(submitInput('user-1'))),
      'ACTIVE_APPLICATION_EXISTS',
    );
  });

  it('reports status view with canReapply flag', async () => {
    const before = await service.getStatusForApplicant('user-1');
    assert.equal(before.hasApplication, false);
    assert.equal(before.canReapply, true);

    await service.submit(submitInput('user-1'));
    const after = await service.getStatusForApplicant('user-1');
    assert.equal(after.hasApplication, true);
    assert.equal(after.canReapply, false);
  });

  it('approves a pending application: status approved + tier upgrade + expert badge', async () => {
    const app = await service.submit(submitInput('user-1'));
    const approved = await service.approve({ applicationId: app.id, adminId: 'admin-1' });

    assert.equal(approved.status, 'approved');
    assert.equal(approved.reviewedByAdminId, 'admin-1');
    assert.notEqual(approved.reviewedAt, null);
    assert.deepEqual(membership.upgraded, ['user-1']);
    // Badge data is carried through to the membership grant.
    assert.equal(membership.grants[0]!.licenseNumber, '2024-0001');
    assert.equal(membership.grants[0]!.specialty, '내과');
    assert.ok(repo.events.some((e) => e.type === 'approved'));
  });

  it('aborts approval when membership upgrade fails (membership not recorded)', async () => {
    const app = await service.submit(submitInput('user-1'));
    membership.failNext();
    await assert.rejects(() => service.approve({ applicationId: app.id, adminId: 'admin-1' }));
    assert.deepEqual(membership.upgraded, []);
  });

  it('rejects a pending application with a reason and records the reason', async () => {
    const app = await service.submit(submitInput('user-1'));
    const rejected = await service.reject({
      applicationId: app.id,
      adminId: 'admin-1',
      reason: '증빙 서류가 불명확합니다.',
    });
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.rejectionReason, '증빙 서류가 불명확합니다.');
    const rejectEvent = repo.events.find((e) => e.type === 'rejected');
    assert.equal(rejectEvent?.note, '증빙 서류가 불명확합니다.');
    assert.deepEqual(membership.upgraded, []);
  });

  it('allows re-application after rejection and blocks it otherwise', async () => {
    const app = await service.submit(submitInput('user-1'));
    assert.equal(
      await codeOfAsync(() => service.reapply(submitInput('user-1'))),
      'ACTIVE_APPLICATION_EXISTS',
    );

    await service.reject({ applicationId: app.id, adminId: 'admin-1', reason: 'redo' });
    const reapplied = await service.reapply(submitInput('user-1'));
    assert.equal(reapplied.status, 'pending');
    assert.equal(repo.events.filter((e) => e.type === 'resubmitted').length, 1);
  });

  it('cannot review a non-pending application', async () => {
    const app = await service.submit(submitInput('user-1'));
    await service.approve({ applicationId: app.id, adminId: 'admin-1' });
    assert.equal(
      await codeOfAsync(() => service.approve({ applicationId: app.id, adminId: 'admin-1' })),
      'NOT_REVIEWABLE',
    );
  });

  it('enforces ownership on getOwnedApplication', async () => {
    const app = await service.submit(submitInput('user-1'));
    assert.equal(await codeOfAsync(() => service.getOwnedApplication(app.id, 'user-2')), 'FORBIDDEN');
    const own = await service.getOwnedApplication(app.id, 'user-1');
    assert.equal(own.id, app.id);
  });

  it('lists applications for admin with status filter and pagination', async () => {
    await service.submit(submitInput('user-1'));
    await service.submit(submitInput('user-2'));
    const all = await service.list({ limit: 10, offset: 0 });
    assert.equal(all.total, 2);
    const pending = await service.list({ status: 'pending', limit: 1, offset: 0 });
    assert.equal(pending.items.length, 1);
    assert.equal(pending.total, 2);
  });

  it('returns NOT_FOUND for unknown application ids', async () => {
    assert.equal(await codeOfAsync(() => service.getById('missing')), 'APPLICATION_NOT_FOUND');
    assert.equal(
      await codeOfAsync(() => service.approve({ applicationId: 'missing', adminId: 'a' })),
      'APPLICATION_NOT_FOUND',
    );
  });
});
