/**
 * Retention policy configuration + pure helpers (BBR-1167).
 *
 * The policy is intentionally *feature-local* (its own env keys, its own
 * defaults) so it does not have to modify the shared `env.ts` owned by the base
 * infra task. Adopting a different retention window is a config change, never a
 * code change.
 *
 * Confirmed defaults (BBR-1167, follow-up to BBR-1127):
 *   - Proof documents are deleted N days AFTER a terminal decision
 *     (approve/reject). Default N = 180 days.
 *   - License number stays plaintext at rest for MVP (admin review needs it).
 *   - Account deletion cascades rows (FK ON DELETE CASCADE); blobs are purged
 *     explicitly via the account-deletion hook.
 */

/** Default retention window: delete proof blobs 180 days after a terminal decision. */
export const DEFAULT_RETENTION_DAYS = 180;

/** How many candidates the purge job processes per page/iteration. */
export const DEFAULT_PURGE_BATCH_SIZE = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RetentionPolicy {
  /** Days after a terminal decision before proof blobs are purged. */
  readonly retentionDays: number;
  /** Max candidates processed per purge iteration. */
  readonly batchSize: number;
}

export interface RetentionEnv {
  readonly DOCTOR_VERIFICATION_RETENTION_DAYS?: string | undefined;
  readonly DOCTOR_VERIFICATION_PURGE_BATCH_SIZE?: string | undefined;
}

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Load the retention policy from the environment, applying confirmed defaults.
 * Invalid / missing values fall back to the default rather than throwing, so a
 * misconfiguration never disables retention silently in an unsafe direction
 * (worst case it uses the conservative 180-day default).
 */
export function loadRetentionPolicy(env: RetentionEnv = process.env): RetentionPolicy {
  return Object.freeze({
    retentionDays: parsePositiveInt(env.DOCTOR_VERIFICATION_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    batchSize: parsePositiveInt(env.DOCTOR_VERIFICATION_PURGE_BATCH_SIZE, DEFAULT_PURGE_BATCH_SIZE),
  });
}

/**
 * Compute the cutoff instant: applications whose terminal decision (`reviewedAt`)
 * is at or before this instant are eligible for purge.
 */
export function purgeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}
