import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { Clock } from '../../src/features/doctor-verification/ports.js';
import {
  DEFAULT_PURGE_BATCH_SIZE,
  DEFAULT_RETENTION_DAYS,
  loadRetentionPolicy,
  purgeCutoff,
} from '../../src/features/doctor-verification/retention.js';
import { ProofRetentionService } from '../../src/features/doctor-verification/retention.service.js';
import {
  FakeProofBlobStorage,
  InMemoryRepository,
} from '../../src/features/doctor-verification/testing/in-memory.js';
import type {
  ProofDocumentRef,
  VerificationStatus,
} from '../../src/features/doctor-verification/types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Clock returning a caller-chosen instant. */
class StubClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date {
    return this.value;
  }
}

const proof = (key: string): ProofDocumentRef => ({
  key,
  filename: `${key}.pdf`,
  contentType: 'application/pdf',
});

interface SeedOpts {
  readonly applicantId: string;
  readonly reviewedAt: Date;
  readonly status?: Exclude<VerificationStatus, 'pending'>;
  readonly proofs?: ReadonlyArray<ProofDocumentRef>;
}

/** Insert an application and drive it to a terminal decision at `reviewedAt`. */
async function seedTerminal(repo: InMemoryRepository, opts: SeedOpts): Promise<string> {
  const app = await repo.insert({
    applicantId: opts.applicantId,
    license: { licenseNumber: '2024-0001', licenseName: '홍길동', specialty: '내과' },
    proofDocuments: opts.proofs ?? [proof(`${opts.applicantId}-a`), proof(`${opts.applicantId}-b`)],
  });
  if ((opts.status ?? 'approved') === 'approved') {
    await repo.markApproved(app.id, 'admin-1', opts.reviewedAt);
  } else {
    await repo.markRejected(app.id, 'admin-1', 'unclear proof', opts.reviewedAt);
  }
  return app.id;
}

describe('retention policy config', () => {
  it('adopts confirmed defaults when unset', () => {
    const policy = loadRetentionPolicy({});
    assert.equal(policy.retentionDays, DEFAULT_RETENTION_DAYS);
    assert.equal(policy.retentionDays, 180);
    assert.equal(policy.batchSize, DEFAULT_PURGE_BATCH_SIZE);
  });

  it('honours valid env overrides', () => {
    const policy = loadRetentionPolicy({
      DOCTOR_VERIFICATION_RETENTION_DAYS: '30',
      DOCTOR_VERIFICATION_PURGE_BATCH_SIZE: '5',
    });
    assert.equal(policy.retentionDays, 30);
    assert.equal(policy.batchSize, 5);
  });

  it('falls back to defaults on invalid / non-positive values (never disables retention)', () => {
    for (const bad of ['0', '-10', 'abc', '']) {
      assert.equal(loadRetentionPolicy({ DOCTOR_VERIFICATION_RETENTION_DAYS: bad }).retentionDays, 180);
    }
  });

  it('purgeCutoff subtracts the window from now', () => {
    const now = new Date(Date.UTC(2026, 5, 1));
    const cutoff = purgeCutoff(now, 180);
    assert.equal(now.getTime() - cutoff.getTime(), 180 * MS_PER_DAY);
  });
});

describe('ProofRetentionService.purgeAgedTerminalApplications', () => {
  let repo: InMemoryRepository;
  let blob: FakeProofBlobStorage;
  const now = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01
  const aged = new Date(Date.UTC(2025, 0, 1)); // > 180d before now
  const fresh = new Date(Date.UTC(2026, 4, 20)); // within the 180d window

  const service = (batchSize = 100) =>
    new ProofRetentionService({
      repo,
      blob,
      clock: new StubClock(now),
      policy: { retentionDays: 180, batchSize },
    });

  beforeEach(() => {
    repo = new InMemoryRepository();
    blob = new FakeProofBlobStorage();
  });

  it('purges aged terminal apps: deletes blobs, clears proofs, stamps proofPurgedAt', async () => {
    const id = await seedTerminal(repo, { applicantId: 'u1', reviewedAt: aged });

    const result = await service().purgeAgedTerminalApplications();

    assert.equal(result.purged, 1);
    assert.equal(result.scanned, 1);
    assert.equal(result.blobsDeleted, 2);
    assert.equal(result.failed, 0);
    assert.deepEqual([...blob.deletedKeys].sort(), ['u1-a', 'u1-b']);

    const row = await repo.findById(id);
    assert.equal(row?.proofDocuments.length, 0);
    assert.notEqual(row?.proofPurgedAt, null);
  });

  it('skips pending applications and apps still inside the retention window', async () => {
    // pending (never reviewed)
    await repo.insert({
      applicantId: 'pending-user',
      license: { licenseNumber: 'x', licenseName: 'y', specialty: null },
      proofDocuments: [proof('pending-a')],
    });
    // terminal but reviewed recently -> not yet eligible
    await seedTerminal(repo, { applicantId: 'fresh-user', reviewedAt: fresh });

    const result = await service().purgeAgedTerminalApplications();

    assert.equal(result.purged, 0);
    assert.equal(result.scanned, 0);
    assert.deepEqual(blob.deletedKeys, []);
  });

  it('purges both approved and rejected terminal applications', async () => {
    await seedTerminal(repo, { applicantId: 'ap', reviewedAt: aged, status: 'approved' });
    await seedTerminal(repo, { applicantId: 're', reviewedAt: aged, status: 'rejected' });

    const result = await service().purgeAgedTerminalApplications();
    assert.equal(result.purged, 2);
    assert.equal(result.blobsDeleted, 4);
  });

  it('is idempotent: a second run purges nothing (already cleared)', async () => {
    await seedTerminal(repo, { applicantId: 'u1', reviewedAt: aged });
    await service().purgeAgedTerminalApplications();

    const second = await service().purgeAgedTerminalApplications();
    assert.equal(second.scanned, 0);
    assert.equal(second.purged, 0);
  });

  it('leaves a row un-purged when blob deletion fails, and retries it on the next run', async () => {
    const id = await seedTerminal(repo, { applicantId: 'u1', reviewedAt: aged });
    blob.failNext();

    const first = await service().purgeAgedTerminalApplications();
    assert.equal(first.failed, 1);
    assert.equal(first.purged, 0);
    const still = await repo.findById(id);
    assert.equal(still?.proofDocuments.length, 2);
    assert.equal(still?.proofPurgedAt, null);

    // No forced failure this time -> the retry succeeds.
    const second = await service().purgeAgedTerminalApplications();
    assert.equal(second.purged, 1);
    assert.equal(second.blobsDeleted, 2);
    const done = await repo.findById(id);
    assert.equal(done?.proofDocuments.length, 0);
    assert.notEqual(done?.proofPurgedAt, null);
  });

  it('pages through more candidates than a single batch', async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedTerminal(repo, { applicantId: `u${i}`, reviewedAt: aged, proofs: [proof(`k${i}`)] });
    }

    const result = await service(2).purgeAgedTerminalApplications();
    assert.equal(result.scanned, 5);
    assert.equal(result.purged, 5);
    assert.equal(result.blobsDeleted, 5);
  });
});

describe('ProofRetentionService.purgeApplicantProofs', () => {
  let repo: InMemoryRepository;
  let blob: FakeProofBlobStorage;
  const now = new Date(Date.UTC(2026, 5, 1));

  const service = () =>
    new ProofRetentionService({
      repo,
      blob,
      clock: new StubClock(now),
      policy: { retentionDays: 180, batchSize: 100 },
    });

  beforeEach(() => {
    repo = new InMemoryRepository();
    blob = new FakeProofBlobStorage();
  });

  it('deletes every retained proof blob for one applicant (any status)', async () => {
    // A pending and a terminal application, both still holding proofs.
    await repo.insert({
      applicantId: 'u1',
      license: { licenseNumber: 'x', licenseName: 'y', specialty: null },
      proofDocuments: [proof('u1-pending')],
    });
    await seedTerminal(repo, {
      applicantId: 'u1',
      reviewedAt: new Date(Date.UTC(2026, 4, 1)),
      proofs: [proof('u1-terminal')],
    });
    // Another applicant's proofs must be untouched.
    await repo.insert({
      applicantId: 'other',
      license: { licenseNumber: 'z', licenseName: 'w', specialty: null },
      proofDocuments: [proof('other-a')],
    });

    const result = await service().purgeApplicantProofs('u1');

    assert.equal(result.applicantId, 'u1');
    assert.equal(result.blobsDeleted, 2);
    assert.deepEqual([...blob.deletedKeys].sort(), ['u1-pending', 'u1-terminal']);
  });

  it('is a no-op for an applicant with no retained proofs', async () => {
    const result = await service().purgeApplicantProofs('nobody');
    assert.equal(result.blobsDeleted, 0);
    assert.deepEqual(blob.deletedKeys, []);
  });
});
