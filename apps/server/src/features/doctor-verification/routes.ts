/**
 * Route table — declarative mapping of method+path -> controller handler +
 * required role. The base router (BBR-1117) iterates this to register routes and
 * apply the entitlement middleware (BBR-1121) per `requiredRole`.
 */
import type { DoctorVerificationController } from './controller.js';

export type RequiredRole = 'member' | 'admin';

export interface RouteDef {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly requiredRole: RequiredRole;
  readonly handler: keyof DoctorVerificationController;
  readonly summary: string;
}

export const doctorVerificationRoutes: ReadonlyArray<RouteDef> = [
  {
    method: 'POST',
    path: '/doctor-verification/applications',
    requiredRole: 'member',
    handler: 'submit',
    summary: 'Submit a doctor verification application',
  },
  {
    method: 'POST',
    path: '/doctor-verification/applications/reapply',
    requiredRole: 'member',
    handler: 'reapply',
    summary: 'Re-apply after a rejected application',
  },
  {
    method: 'GET',
    path: '/doctor-verification/me',
    requiredRole: 'member',
    handler: 'myStatus',
    summary: 'Get my verification status',
  },
  {
    method: 'GET',
    path: '/doctor-verification/applications/:id',
    requiredRole: 'member',
    handler: 'getOwn',
    summary: 'Get my application by id',
  },
  {
    method: 'GET',
    path: '/admin/doctor-verification/applications',
    requiredRole: 'admin',
    handler: 'adminList',
    summary: 'List verification applications',
  },
  {
    method: 'GET',
    path: '/admin/doctor-verification/applications/:id',
    requiredRole: 'admin',
    handler: 'adminGet',
    summary: 'Get an application by id',
  },
  {
    method: 'POST',
    path: '/admin/doctor-verification/applications/:id/approve',
    requiredRole: 'admin',
    handler: 'adminApprove',
    summary: 'Approve an application (upgrade tier + grant expert badge)',
  },
  {
    method: 'POST',
    path: '/admin/doctor-verification/applications/:id/reject',
    requiredRole: 'admin',
    handler: 'adminReject',
    summary: 'Reject an application with a reason',
  },
];
