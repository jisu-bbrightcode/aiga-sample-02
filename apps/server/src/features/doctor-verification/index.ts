/** Public surface of the doctor-verification feature. */
export * from './types.js';
export * from './errors.js';
export * from './ports.js';
export * from './state-machine.js';
export { DoctorVerificationService } from './service.js';
export type { DoctorVerificationServiceDeps } from './service.js';
export {
  createDoctorVerificationController,
  toErrorResponse,
} from './controller.js';
export type {
  Actor,
  HandlerRequest,
  HandlerResponse,
  DoctorVerificationController,
} from './controller.js';
export { doctorVerificationRoutes } from './routes.js';
export type { RouteDef, RequiredRole } from './routes.js';
export { doctorVerificationPaths, doctorVerificationComponents } from './openapi.js';
export {
  DrizzleDoctorVerificationRepository,
  DrizzleTransactor,
} from './drizzle-repository.js';
export type { DrizzleDb } from './drizzle-repository.js';
export {
  DrizzleDoctorMembershipService,
  doctorMembershipFactory,
} from './membership.service.js';
export {
  createDoctorVerificationRouter,
  createDoctorVerificationService,
} from './http.js';
export type { DoctorVerificationRouterDeps } from './http.js';
export * from './schema.js';
export * from './validation.js';
