/**
 * Application service — orchestrates the doctor-verification use cases.
 *
 * Depends only on ports (repository, membership, transactor, clock), so it is
 * fully unit-testable with in-memory fakes and independent of Drizzle / the web
 * framework / BBR-1121 internals.
 */
import {
  applicationNotFound,
  forbidden,
} from './errors.js';
import {
  assertCanReapply,
  assertCanSubmit,
  assertReviewable,
  canReapply,
} from './state-machine.js';
import type {
  Clock,
  DoctorVerificationRepository,
  MembershipService,
  Transactor,
} from './ports.js';
import type {
  ListApplicationsQuery,
  Paginated,
  RejectDecisionInput,
  ReviewDecisionInput,
  SubmitApplicationInput,
  VerificationApplication,
  VerificationStatusView,
} from './types.js';

export interface DoctorVerificationServiceDeps {
  readonly repo: DoctorVerificationRepository;
  readonly membership: MembershipService;
  readonly transactor: Transactor;
  readonly clock: Clock;
}

export class DoctorVerificationService {
  private readonly repo: DoctorVerificationRepository;
  private readonly membership: MembershipService;
  private readonly transactor: Transactor;
  private readonly clock: Clock;

  constructor(deps: DoctorVerificationServiceDeps) {
    this.repo = deps.repo;
    this.membership = deps.membership;
    this.transactor = deps.transactor;
    this.clock = deps.clock;
  }

  /** Member submits a new (or repeat) verification application. */
  async submit(input: SubmitApplicationInput): Promise<VerificationApplication> {
    const latest = await this.repo.findLatestByApplicant(input.applicantId);
    const eventType = assertCanSubmit(latest);

    const application = await this.repo.insert({
      applicantId: input.applicantId,
      license: input.license,
      proofDocuments: input.proofDocuments,
    });
    await this.repo.recordEvent({
      applicationId: application.id,
      type: eventType,
      actorId: input.applicantId,
    });
    return application;
  }

  /**
   * Explicit re-application after a rejection. Behaves like submit but requires
   * the previous application to be in the 'rejected' state.
   */
  async reapply(input: SubmitApplicationInput): Promise<VerificationApplication> {
    const latest = await this.repo.findLatestByApplicant(input.applicantId);
    assertCanReapply(latest);

    const application = await this.repo.insert({
      applicantId: input.applicantId,
      license: input.license,
      proofDocuments: input.proofDocuments,
    });
    await this.repo.recordEvent({
      applicationId: application.id,
      type: 'resubmitted',
      actorId: input.applicantId,
    });
    return application;
  }

  /** Member views their own verification status. */
  async getStatusForApplicant(applicantId: string): Promise<VerificationStatusView> {
    const latest = await this.repo.findLatestByApplicant(applicantId);
    return {
      hasApplication: Boolean(latest),
      application: latest ?? null,
      canReapply: canReapply(latest),
    };
  }

  /** Applicant fetches a specific application they own. */
  async getOwnedApplication(
    applicationId: string,
    applicantId: string,
  ): Promise<VerificationApplication> {
    const application = await this.repo.findById(applicationId);
    if (!application) throw applicationNotFound();
    if (application.applicantId !== applicantId) throw forbidden();
    return application;
  }

  /** Admin: paginated list, optionally filtered by status. */
  async list(query: ListApplicationsQuery): Promise<Paginated<VerificationApplication>> {
    return this.repo.list(query);
  }

  /** Admin: fetch any application by id. */
  async getById(applicationId: string): Promise<VerificationApplication> {
    const application = await this.repo.findById(applicationId);
    if (!application) throw applicationNotFound();
    return application;
  }

  /**
   * Admin approves an application. In a single transaction:
   *   1) mark the application approved,
   *   2) record the 'approved' event,
   *   3) upgrade the applicant's membership tier + grant expert badge.
   * If the membership upgrade fails, the whole approval is rolled back.
   */
  async approve(input: ReviewDecisionInput): Promise<VerificationApplication> {
    const application = await this.repo.findById(input.applicationId);
    if (!application) throw applicationNotFound();
    assertReviewable(application);

    const reviewedAt = this.clock.now();

    return this.transactor.run(async ({ repo, membership }) => {
      const approved = await repo.markApproved(application.id, input.adminId, reviewedAt);
      await repo.recordEvent({
        applicationId: application.id,
        type: 'approved',
        actorId: input.adminId,
      });
      await membership.grantDoctorVerified({
        userId: application.applicantId,
        specialty: application.license.specialty,
        licenseNumber: application.license.licenseNumber,
        verifiedAt: reviewedAt,
      });
      return approved;
    });
  }

  /** Admin rejects an application with a reason (no membership change). */
  async reject(input: RejectDecisionInput): Promise<VerificationApplication> {
    const application = await this.repo.findById(input.applicationId);
    if (!application) throw applicationNotFound();
    assertReviewable(application);

    const reviewedAt = this.clock.now();

    return this.transactor.run(async ({ repo }) => {
      const rejected = await repo.markRejected(
        application.id,
        input.adminId,
        input.reason,
        reviewedAt,
      );
      await repo.recordEvent({
        applicationId: application.id,
        type: 'rejected',
        actorId: input.adminId,
        note: input.reason,
      });
      return rejected;
    });
  }
}
