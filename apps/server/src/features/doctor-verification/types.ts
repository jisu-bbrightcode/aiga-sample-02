/** Domain types for doctor license verification. Framework-agnostic. */

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export type VerificationEventType = 'submitted' | 'resubmitted' | 'approved' | 'rejected';

/** A single proof document reference (stored in blob storage, referenced by key). */
export interface ProofDocumentRef {
  readonly key: string;
  readonly filename: string;
  readonly contentType: string;
}

/** Minimal license information collected from the applicant. */
export interface LicenseInfo {
  readonly licenseNumber: string;
  readonly licenseName: string;
  readonly specialty: string | null;
}

export interface VerificationApplication {
  readonly id: string;
  readonly applicantId: string;
  readonly status: VerificationStatus;
  readonly license: LicenseInfo;
  readonly proofDocuments: ReadonlyArray<ProofDocumentRef>;
  readonly rejectionReason: string | null;
  readonly reviewedByAdminId: string | null;
  readonly reviewedAt: Date | null;
  /**
   * When the proof blob objects were purged and `proofDocuments` cleared per the
   * retention policy (BBR-1167). `null` while proofs are still retained. A row
   * can be terminal (approved/rejected) yet still have `proofPurgedAt = null`
   * until the retention window elapses and the purge job runs.
   */
  readonly proofPurgedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VerificationEvent {
  readonly id: string;
  readonly applicationId: string;
  readonly type: VerificationEventType;
  readonly actorId: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** Command inputs (already validated at the boundary via zod). */
export interface SubmitApplicationInput {
  readonly applicantId: string;
  readonly license: LicenseInfo;
  readonly proofDocuments: ReadonlyArray<ProofDocumentRef>;
}

export interface ReviewDecisionInput {
  readonly applicationId: string;
  readonly adminId: string;
}

export interface RejectDecisionInput extends ReviewDecisionInput {
  readonly reason: string;
}

export interface ListApplicationsQuery {
  readonly status?: VerificationStatus;
  readonly limit: number;
  readonly offset: number;
}

export interface Paginated<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** Read model returned to the applicant on status queries. */
export interface VerificationStatusView {
  readonly hasApplication: boolean;
  readonly application: VerificationApplication | null;
  readonly canReapply: boolean;
}
