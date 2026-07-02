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

// Retention / deletion policy (BBR-1167).
export {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_PURGE_BATCH_SIZE,
  loadRetentionPolicy,
  purgeCutoff,
} from './retention.js';
export type { RetentionPolicy, RetentionEnv } from './retention.js';
export {
  ProofRetentionService,
} from './retention.service.js';
export type {
  ProofRetentionServiceDeps,
  AgedPurgeResult,
  ApplicantPurgeResult,
} from './retention.service.js';
export {
  createProofRetentionService,
  runProofRetentionPurge,
} from './retention-job.js';
export {
  createProofBlobStorage,
  NoopProofBlobStorage,
  VercelProofBlobStorage,
} from './blob-storage.js';
