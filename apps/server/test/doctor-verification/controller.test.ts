import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  createDoctorVerificationController,
  type HandlerRequest,
} from '../../src/features/doctor-verification/controller.js';
import { DoctorVerificationService } from '../../src/features/doctor-verification/service.js';
import {
  DirectTransactor,
  FakeMembershipService,
  FixedClock,
  InMemoryRepository,
} from '../../src/features/doctor-verification/testing/in-memory.js';

const req = (over: Partial<HandlerRequest>): HandlerRequest => ({
  actor: { userId: 'user-1', role: 'member' },
  params: {},
  query: {},
  body: {},
  ...over,
});

const validBody = {
  license: { licenseNumber: '2024-0001', licenseName: '홍길동', specialty: '내과' },
  proofDocuments: [{ key: 'blob/abc', filename: 'l.pdf', contentType: 'application/pdf' }],
};

describe('doctor-verification controller', () => {
  let controller: ReturnType<typeof createDoctorVerificationController>;
  let membership: FakeMembershipService;

  beforeEach(() => {
    const repo = new InMemoryRepository();
    membership = new FakeMembershipService();
    const service = new DoctorVerificationService({
      repo,
      membership,
      transactor: new DirectTransactor({ repo, membership }),
      clock: new FixedClock(),
    });
    controller = createDoctorVerificationController(service);
  });

  it('returns 201 { ok: true } on valid submit', async () => {
    const res = await controller.submit(req({ body: validBody }));
    assert.equal(res.status, 201);
    assert.equal((res.body as { ok: boolean }).ok, true);
  });

  it('returns 400 VALIDATION_ERROR on missing proof documents', async () => {
    const res = await controller.submit(
      req({ body: { license: validBody.license, proofDocuments: [] } }),
    );
    assert.equal(res.status, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'VALIDATION_ERROR');
  });

  it('maps domain 409 conflicts to responses', async () => {
    await controller.submit(req({ body: validBody }));
    const res = await controller.submit(req({ body: validBody }));
    assert.equal(res.status, 409);
    assert.equal(
      (res.body as { error: { code: string } }).error.code,
      'ACTIVE_APPLICATION_EXISTS',
    );
  });

  it('admin approve upgrades membership', async () => {
    const submitted = (await controller.submit(req({ body: validBody }))).body as {
      data: { id: string };
    };
    const res = await controller.adminApprove(
      req({ actor: { userId: 'admin-1', role: 'admin' }, params: { id: submitted.data.id } }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(membership.upgraded, ['user-1']);
  });

  it('admin reject returns 400 when reason missing', async () => {
    const submitted = (await controller.submit(req({ body: validBody }))).body as {
      data: { id: string };
    };
    const res = await controller.adminReject(
      req({ actor: { userId: 'admin-1', role: 'admin' }, params: { id: submitted.data.id }, body: {} }),
    );
    assert.equal(res.status, 400);
  });
});
