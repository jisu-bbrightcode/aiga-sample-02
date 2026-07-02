/**
 * Scheduled retention purge entry point (BBR-1167).
 *
 * Wire this to a scheduler (Vercel Cron hitting the admin route, a platform
 * cron invoking a one-shot process, etc.). It builds the retention service from
 * the shared Drizzle pool + feature-local config and runs the aged purge once.
 *
 * The admin HTTP route `POST /admin/doctor-verification/retention/purge` calls
 * the same service, so a Vercel Cron entry can simply hit that endpoint; this
 * module exists for schedulers that prefer invoking a process directly.
 */
import { getDb } from '../../db/client.js';
import { createProofBlobStorage } from './blob-storage.js';
import { DrizzleDoctorVerificationRepository, type DrizzleDb } from './drizzle-repository.js';
import { loadRetentionPolicy } from './retention.js';
import { ProofRetentionService, type AgedPurgeResult } from './retention.service.js';

const systemClock = { now: () => new Date() };

/** Build a retention service bound to the shared pool + environment config. */
export function createProofRetentionService(
  db: DrizzleDb = getDb() as unknown as DrizzleDb,
): ProofRetentionService {
  return new ProofRetentionService({
    repo: new DrizzleDoctorVerificationRepository(db),
    blob: createProofBlobStorage(),
    clock: systemClock,
    policy: loadRetentionPolicy(),
  });
}

/** Run the aged-application purge once and return the summary. */
export function runProofRetentionPurge(
  db?: DrizzleDb,
): Promise<AgedPurgeResult> {
  return createProofRetentionService(db).purgeAgedTerminalApplications();
}
