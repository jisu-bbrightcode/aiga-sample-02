/**
 * Integration ports. These interfaces are the seam between this feature and:
 *   - persistence (Drizzle repository)         -> DoctorVerificationRepository
 *   - auth/membership (BBR-1121)               -> MembershipService
 *   - atomic multi-write operations            -> Transactor
 *   - deterministic time / id (for testing)    -> Clock, IdGenerator
 *
 * Keeping membership behind a narrow port means the "approval -> tier upgrade +
 * expert badge" transaction does not hard-depend on BBR-1121's internal schema.
 * BBR-1121 provides a concrete MembershipService; this feature only needs the
 * upgrade operation.
 */
import type {
  ListApplicationsQuery,
  Paginated,
  ProofDocumentRef,
  LicenseInfo,
  VerificationApplication,
  VerificationEvent,
  VerificationEventType,
} from './types.js';

export interface InsertApplicationData {
  readonly applicantId: string;
  readonly license: LicenseInfo;
  readonly proofDocuments: ReadonlyArray<ProofDocumentRef>;
}

export interface RecordEventData {
  readonly applicationId: string;
  readonly type: VerificationEventType;
  readonly actorId: string;
  readonly note?: string | null;
}

export interface DoctorVerificationRepository {
  /** Latest application (any status) for an applicant, or undefined. */
  findLatestByApplicant(applicantId: string): Promise<VerificationApplication | undefined>;
  findById(id: string): Promise<VerificationApplication | undefined>;
  list(query: ListApplicationsQuery): Promise<Paginated<VerificationApplication>>;
  insert(data: InsertApplicationData): Promise<VerificationApplication>;
  /** Sets status to 'approved' with reviewer metadata; returns updated row. */
  markApproved(id: string, adminId: string, reviewedAt: Date): Promise<VerificationApplication>;
  /** Sets status to 'rejected' with reason + reviewer metadata; returns updated row. */
  markRejected(
    id: string,
    adminId: string,
    reason: string,
    reviewedAt: Date,
  ): Promise<VerificationApplication>;
  recordEvent(data: RecordEventData): Promise<VerificationEvent>;
}

/**
 * Data needed to promote a user to the doctor-verified tier + expert badge.
 * Sourced from the approved application so the profile badge fields
 * (specialty / license number / verified-at) can be populated coherently.
 */
export interface DoctorVerificationGrant {
  readonly userId: string;
  readonly specialty: string | null;
  readonly licenseNumber: string;
  readonly verifiedAt: Date;
}

/**
 * Integrates with the auth/membership module (BBR-1121). The concrete Drizzle
 * implementation lives in `membership.service.ts` and writes the `profiles`
 * table; a fake is used in tests.
 */
export interface MembershipService {
  /**
   * Upgrade a user to the "doctor-verified" tier (의사인증회원) and grant the
   * expert badge. Must be idempotent per user. Runs inside the approval
   * transaction so it is atomic with the application status change.
   */
  grantDoctorVerified(grant: DoctorVerificationGrant): Promise<void>;
}

/** A transaction scope binds tx-aware implementations of the write ports. */
export interface TransactionScope {
  readonly repo: DoctorVerificationRepository;
  readonly membership: MembershipService;
}

export interface Transactor {
  run<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
