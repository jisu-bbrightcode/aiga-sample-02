/**
 * Proof-document retention service (BBR-1167).
 *
 * Two responsibilities, both delete-only:
 *   1. `purgeAgedTerminalApplications` — the scheduled job. Finds terminal
 *      (approved/rejected) applications whose retention window has elapsed and
 *      still hold proof references, deletes the blob objects, then clears the
 *      `proofDocuments` column and stamps `proofPurgedAt`.
 *   2. `purgeApplicantProofs` — the account-deletion / right-to-erasure hook.
 *      Deletes every retained proof blob for one applicant. DB rows themselves
 *      cascade via the FK, so this only removes the out-of-DB blob objects.
 *
 * Ordering guarantee: blobs are deleted BEFORE the row is marked purged. If the
 * process dies between the two, the row stays a candidate and the next run
 * retries — safe because blob deletion is idempotent.
 *
 * Depends only on ports (repo, blob storage, clock) so it is fully unit-testable
 * with in-memory fakes.
 */
import type { Clock, DoctorVerificationRepository, ProofBlobStorage } from './ports.js';
import { purgeCutoff, type RetentionPolicy } from './retention.js';

export interface ProofRetentionServiceDeps {
  readonly repo: DoctorVerificationRepository;
  readonly blob: ProofBlobStorage;
  readonly clock: Clock;
  readonly policy: RetentionPolicy;
}

export interface AgedPurgeResult {
  /** Instant used as the retention cutoff for this run. */
  readonly cutoff: Date;
  /** Applications inspected as candidates. */
  readonly scanned: number;
  /** Applications successfully purged (blobs deleted + row cleared). */
  readonly purged: number;
  /** Proof blob objects deleted. */
  readonly blobsDeleted: number;
  /** Applications whose blob deletion failed and were left for a later run. */
  readonly failed: number;
}

export interface ApplicantPurgeResult {
  readonly applicantId: string;
  readonly blobsDeleted: number;
}

export class ProofRetentionService {
  private readonly repo: DoctorVerificationRepository;
  private readonly blob: ProofBlobStorage;
  private readonly clock: Clock;
  private readonly policy: RetentionPolicy;

  constructor(deps: ProofRetentionServiceDeps) {
    this.repo = deps.repo;
    this.blob = deps.blob;
    this.clock = deps.clock;
    this.policy = deps.policy;
  }

  /**
   * Purge every terminal application past its retention window. Pages through
   * candidates in `batchSize` chunks. A failed blob deletion on one application
   * does not abort the run — it is counted in `failed` and retried next time.
   */
  async purgeAgedTerminalApplications(): Promise<AgedPurgeResult> {
    const now = this.clock.now();
    const cutoff = purgeCutoff(now, this.policy.retentionDays);

    let scanned = 0;
    let purged = 0;
    let blobsDeleted = 0;
    let failed = 0;

    // Bound the outer loop defensively: each successful purge removes rows from
    // the candidate set, so progress is monotonic. If a whole batch fails
    // (nothing cleared), we stop to avoid spinning on the same rows.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidates = await this.repo.findProofPurgeCandidates(cutoff, this.policy.batchSize);
      if (candidates.length === 0) break;

      let clearedThisBatch = 0;
      for (const app of candidates) {
        scanned += 1;
        const keys = app.proofDocuments.map((doc) => doc.key);
        try {
          await this.blob.deleteMany(keys);
          await this.repo.clearProofDocuments(app.id, now);
          purged += 1;
          clearedThisBatch += 1;
          blobsDeleted += keys.length;
        } catch {
          // Leave the row as a candidate; a later run retries it.
          failed += 1;
        }
      }

      // No forward progress this batch (all failed) — stop to avoid an infinite
      // loop re-reading the same un-purgeable rows.
      if (clearedThisBatch === 0) break;
    }

    return { cutoff, scanned, purged, blobsDeleted, failed };
  }

  /**
   * Delete all retained proof blobs for a single applicant. Intended to run from
   * the account-deletion pipeline (before/around the cascade delete) or a
   * GDPR-style erasure request. Idempotent.
   */
  async purgeApplicantProofs(applicantId: string): Promise<ApplicantPurgeResult> {
    const keys = await this.repo.listProofKeysByApplicant(applicantId);
    if (keys.length > 0) {
      await this.blob.deleteMany(keys);
    }
    return { applicantId, blobsDeleted: keys.length };
  }
}
