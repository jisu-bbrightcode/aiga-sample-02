/**
 * Express integration for the doctor-verification feature.
 *
 * Builds the service from the Drizzle adapters (repository + tx-aware
 * membership) and mounts the routes with the shared entitlement middleware.
 * The framework-agnostic controller does the parsing + domain error mapping;
 * this layer only translates its { status, body } result onto the Express
 * response, so behaviour stays consistent with the unit-tested controller.
 */
import { Router, type Request } from 'express';

import { getDb, type Database } from '../../db/client.js';
import { asyncHandler } from '../../http/async.js';
import {
  requireAdmin,
  requirePermission,
  requireTier,
} from '../../http/middleware/entitlement.js';
import { can, GUEST_PRINCIPAL } from '../../rbac/entitlement.js';
import { PERMISSIONS } from '../../rbac/permissions.js';
import {
  createDoctorVerificationController,
  type Actor,
  type HandlerRequest,
} from './controller.js';
import {
  DrizzleDoctorVerificationRepository,
  DrizzleTransactor,
  type DrizzleDb,
} from './drizzle-repository.js';
import { doctorMembershipFactory } from './membership.service.js';
import { DoctorVerificationService } from './service.js';

const systemClock = { now: () => new Date() };

const actorOf = (req: Request): Actor => {
  const principal = req.principal ?? GUEST_PRINCIPAL;
  return {
    // requireAuth/requireTier guarantee a non-guest principal on these routes.
    userId: principal.userId ?? '',
    role: can(principal, PERMISSIONS.adminAccess) ? 'admin' : 'member',
  };
};

const toHandlerRequest = (req: Request): HandlerRequest => ({
  actor: actorOf(req),
  params: req.params as Record<string, string>,
  query: req.query as Record<string, unknown>,
  body: req.body,
});

export interface DoctorVerificationRouterDeps {
  /** Drizzle db handle; defaults to the shared pool. Injectable for tests. */
  readonly db?: Database;
}

export function createDoctorVerificationService(
  db: DrizzleDb,
): DoctorVerificationService {
  const repo = new DrizzleDoctorVerificationRepository(db);
  const transactor = new DrizzleTransactor(db, doctorMembershipFactory);
  const membership = doctorMembershipFactory(db);
  return new DoctorVerificationService({ repo, membership, transactor, clock: systemClock });
}

export function createDoctorVerificationRouter(deps: DoctorVerificationRouterDeps = {}): Router {
  const db = (deps.db ?? getDb()) as unknown as DrizzleDb;
  const service = createDoctorVerificationService(db);
  const controller = createDoctorVerificationController(service);

  const send = (handler: (req: HandlerRequest) => Promise<{ status: number; body: unknown }>) =>
    asyncHandler(async (req, res) => {
      const result = await handler(toHandlerRequest(req));
      res.status(result.status).json(result.body);
    });

  const router = Router();

  // --- Member routes (일반회원) ---
  router.post('/doctor-verification/applications', requireTier('member'), send(controller.submit));
  router.post(
    '/doctor-verification/applications/reapply',
    requireTier('member'),
    send(controller.reapply),
  );
  router.get('/doctor-verification/me', requireTier('member'), send(controller.myStatus));
  router.get(
    '/doctor-verification/applications/:id',
    requireTier('member'),
    send(controller.getOwn),
  );

  // --- Admin routes (관리자 검수) ---
  router.get(
    '/admin/doctor-verification/applications',
    requireAdmin(),
    requirePermission(PERMISSIONS.adminUsersRead),
    send(controller.adminList),
  );
  router.get(
    '/admin/doctor-verification/applications/:id',
    requireAdmin(),
    requirePermission(PERMISSIONS.adminUsersRead),
    send(controller.adminGet),
  );
  router.post(
    '/admin/doctor-verification/applications/:id/approve',
    requireAdmin(),
    requirePermission(PERMISSIONS.adminUsersUpdate),
    send(controller.adminApprove),
  );
  router.post(
    '/admin/doctor-verification/applications/:id/reject',
    requireAdmin(),
    requirePermission(PERMISSIONS.adminUsersUpdate),
    send(controller.adminReject),
  );

  return router;
}
