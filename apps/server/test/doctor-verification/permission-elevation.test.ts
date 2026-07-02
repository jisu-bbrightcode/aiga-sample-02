/**
 * BE QA — 의사 인증 (BBR-1128)
 *
 * Deliverable 2: "승인 시 등급/뱃지 반영 및 권한 상승 검증"
 *
 * The service-level tests (service.test.ts) prove that approval *fires* a
 * membership grant against a FakeMembershipService. They do NOT prove:
 *   (A) the concrete grant actually writes the tier/badge columns that elevate
 *       the user (일반회원 member → 의사인증회원 verified_doctor), and
 *   (B) that this elevation translates into real permission/policy changes in
 *       the rbac + membership layers (expert answering, expert badge, higher
 *       posting/upload limits, wider content visibility).
 *
 * This file verifies the approval → elevation → entitlement chain end-to-end,
 * plus the full application lifecycle event timeline (Deliverable 1) and the
 * rejection/re-application path (Deliverable 3) as an integrated sequence.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { DoctorVerificationService } from '../../src/features/doctor-verification/service.js';
import { DrizzleDoctorMembershipService } from '../../src/features/doctor-verification/membership.service.js';
import {
  DirectTransactor,
  FakeMembershipService,
  FixedClock,
  InMemoryRepository,
} from '../../src/features/doctor-verification/testing/in-memory.js';
import type { SubmitApplicationInput } from '../../src/features/doctor-verification/types.js';
import type { DrizzleDb } from '../../src/features/doctor-verification/drizzle-repository.js';

import { can, GUEST_PRINCIPAL, type Principal } from '../../src/rbac/entitlement.js';
import { PERMISSIONS } from '../../src/rbac/permissions.js';
import { resolvePolicy } from '../../src/membership/policy.js';
import { tierAtLeast, tierRank, type MembershipTier } from '../../src/membership/tiers.js';

const REVIEWED_AT = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));

const submitInput = (applicantId: string): SubmitApplicationInput => ({
  applicantId,
  license: { licenseNumber: '2024-0001', licenseName: '홍길동', specialty: '내과' },
  proofDocuments: [{ key: 'blob/abc', filename: 'license.pdf', contentType: 'application/pdf' }],
});

/** A principal carrying only its membership tier (no staff roles). */
const tierPrincipal = (userId: string, tier: MembershipTier): Principal => ({
  userId,
  tier,
  roleKeys: [],
  rolePermissions: new Set(),
});

describe('doctor verification — permission elevation (BBR-1128)', () => {
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
      clock: new FixedClock(REVIEWED_AT),
    });
  });

  // --- (A) concrete grant writes the elevation columns -----------------------

  it('approval drives DrizzleDoctorMembershipService to write verified_doctor tier + expert badge', async () => {
    // Capture the row the concrete membership service upserts into `profiles`.
    let insertedValues: Record<string, unknown> | undefined;
    let conflictSet: Record<string, unknown> | undefined;

    const capturingDb = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          insertedValues = v;
          return {
            onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
              conflictSet = set;
              return Promise.resolve();
            },
          };
        },
      }),
      select: () => {
        throw new Error('unused');
      },
      update: () => {
        throw new Error('unused');
      },
      transaction: <T,>(fn: (tx: DrizzleDb) => Promise<T>) => fn(capturingDb),
    } as unknown as DrizzleDb;

    const concreteMembership = new DrizzleDoctorMembershipService(capturingDb);
    const svc = new DoctorVerificationService({
      repo,
      membership: concreteMembership,
      transactor: new DirectTransactor({ repo, membership: concreteMembership }),
      clock: new FixedClock(REVIEWED_AT),
    });

    const app = await svc.submit(submitInput('user-1'));
    await svc.approve({ applicationId: app.id, adminId: 'admin-1' });

    assert.ok(insertedValues, 'expected a profiles upsert on approval');
    // The values that actually elevate the member to 의사인증회원 + expert badge.
    assert.equal(insertedValues!.userId, 'user-1');
    assert.equal(insertedValues!.tier, 'verified_doctor');
    assert.equal(insertedValues!.isExpert, true);
    assert.equal(insertedValues!.expertBadge, 'verified_doctor');
    assert.equal(insertedValues!.specialty, '내과');
    assert.equal(insertedValues!.licenseNumber, '2024-0001');
    assert.deepEqual(insertedValues!.licenseVerifiedAt, REVIEWED_AT);

    // Idempotent upsert must re-apply the same elevation on conflict.
    assert.ok(conflictSet, 'expected onConflictDoUpdate for idempotency');
    assert.equal(conflictSet!.tier, 'verified_doctor');
    assert.equal(conflictSet!.isExpert, true);
    assert.equal(conflictSet!.expertBadge, 'verified_doctor');
  });

  // --- (B) elevation changes effective permissions & policy ------------------

  it('member lacks expert capabilities before approval; gains them after tier elevation', () => {
    // Pre-approval: the applicant is a 일반회원 (member).
    const before = tierPrincipal('user-1', 'member');
    assert.equal(can(before, PERMISSIONS.expertAnswer), false);
    assert.equal(can(before, PERMISSIONS.expertBadgeDisplay), false);

    const beforePolicy = resolvePolicy('member');
    assert.equal(beforePolicy.canAnswerAsExpert, false);
    assert.equal(beforePolicy.showExpertBadge, false);
    assert.equal(beforePolicy.contentVisibility, 'members');
    assert.equal(beforePolicy.dailyPostLimit, 20);
    assert.equal(beforePolicy.maxUploadMb, 10);

    // Post-approval the profile tier becomes verified_doctor (see grant test).
    const after = tierPrincipal('user-1', 'verified_doctor');
    assert.equal(can(after, PERMISSIONS.expertAnswer), true);
    assert.equal(can(after, PERMISSIONS.expertBadgeDisplay), true);
    // Elevation is additive: member permissions are retained.
    assert.equal(can(after, PERMISSIONS.contentCreate), true);
    assert.equal(can(after, PERMISSIONS.reviewCreate), true);

    const afterPolicy = resolvePolicy('verified_doctor');
    assert.equal(afterPolicy.canAnswerAsExpert, true);
    assert.equal(afterPolicy.showExpertBadge, true);
    assert.equal(afterPolicy.contentVisibility, 'all');
    assert.equal(afterPolicy.dailyPostLimit, null); // unlimited
    assert.equal(afterPolicy.maxUploadMb, 50);

    // The elevation is a strict rank increase and never grants admin scope.
    assert.equal(tierAtLeast('verified_doctor', 'member'), true);
    assert.ok(tierRank('verified_doctor') > tierRank('member'));
    assert.equal(can(after, PERMISSIONS.adminUsersUpdate), false);
  });

  it('rejection grants no elevation: applicant stays a plain member with no expert rights', async () => {
    const app = await service.submit(submitInput('user-1'));
    await service.reject({ applicationId: app.id, adminId: 'admin-1', reason: '증빙 불충분' });

    assert.deepEqual(membership.upgraded, []); // no tier change fired
    // Their effective tier is unchanged; expert capabilities remain denied.
    const stillMember = tierPrincipal('user-1', 'member');
    assert.equal(can(stillMember, PERMISSIONS.expertAnswer), false);
    // A never-authenticated guest is even more restricted.
    assert.equal(can(GUEST_PRINCIPAL, PERMISSIONS.contentCreate), false);
  });

  // --- (1 & 3) full lifecycle timeline: submit → reject → reapply → approve ---

  it('records the full 신청→반려→재신청→승인 event timeline with a single elevation at approval', async () => {
    const first = await service.submit(submitInput('user-1'));
    assert.equal(first.status, 'pending');

    await service.reject({ applicationId: first.id, adminId: 'admin-1', reason: 'redo' });
    let view = await service.getStatusForApplicant('user-1');
    assert.equal(view.canReapply, true);
    assert.deepEqual(membership.upgraded, []); // rejection does not elevate

    const second = await service.reapply(submitInput('user-1'));
    assert.equal(second.status, 'pending');
    assert.notEqual(second.id, first.id); // a fresh application row

    const approved = await service.approve({ applicationId: second.id, adminId: 'admin-1' });
    assert.equal(approved.status, 'approved');

    // Event log reflects each transition in order.
    assert.deepEqual(
      repo.events.map((e) => e.type),
      ['submitted', 'rejected', 'resubmitted', 'approved'],
    );

    // Elevation happens exactly once, only at approval, for this applicant.
    assert.deepEqual(membership.upgraded, ['user-1']);
    assert.equal(membership.grants.length, 1);
    assert.equal(membership.grants[0]!.licenseNumber, '2024-0001');

    // Approved is terminal: no further review or re-application.
    const finalView = await service.getStatusForApplicant('user-1');
    assert.equal(finalView.canReapply, false);
  });
});
