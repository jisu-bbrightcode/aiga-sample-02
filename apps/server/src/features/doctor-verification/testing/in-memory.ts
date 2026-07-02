/**
 * In-memory port implementations for unit tests and local development.
 * Immutable-friendly: rows are cloned on read/write; no external I/O.
 */
import type {
  Clock,
  DoctorVerificationGrant,
  DoctorVerificationRepository,
  InsertApplicationData,
  MembershipService,
  RecordEventData,
  Transactor,
  TransactionScope,
} from '../ports.js';
import type {
  ListApplicationsQuery,
  Paginated,
  VerificationApplication,
  VerificationEvent,
} from '../types.js';

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${++seq}`;

export class InMemoryRepository implements DoctorVerificationRepository {
  private applications: VerificationApplication[] = [];
  readonly events: VerificationEvent[] = [];

  async findLatestByApplicant(applicantId: string): Promise<VerificationApplication | undefined> {
    const matches = this.applications
      .filter((a) => a.applicantId === applicantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0];
  }

  async findById(id: string): Promise<VerificationApplication | undefined> {
    return this.applications.find((a) => a.id === id);
  }

  async list(query: ListApplicationsQuery): Promise<Paginated<VerificationApplication>> {
    const filtered = this.applications
      .filter((a) => (query.status ? a.status === query.status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async insert(data: InsertApplicationData): Promise<VerificationApplication> {
    const now = new Date(Date.UTC(2026, 0, 1, 0, 0, seq));
    const application: VerificationApplication = {
      id: nextId('app'),
      applicantId: data.applicantId,
      status: 'pending',
      license: data.license,
      proofDocuments: data.proofDocuments,
      rejectionReason: null,
      reviewedByAdminId: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.applications = [...this.applications, application];
    return application;
  }

  private replace(next: VerificationApplication): VerificationApplication {
    this.applications = this.applications.map((a) => (a.id === next.id ? next : a));
    return next;
  }

  async markApproved(
    id: string,
    adminId: string,
    reviewedAt: Date,
  ): Promise<VerificationApplication> {
    const app = this.applications.find((a) => a.id === id);
    if (!app) throw new Error('not found');
    return this.replace({
      ...app,
      status: 'approved',
      reviewedByAdminId: adminId,
      reviewedAt,
      rejectionReason: null,
      updatedAt: reviewedAt,
    });
  }

  async markRejected(
    id: string,
    adminId: string,
    reason: string,
    reviewedAt: Date,
  ): Promise<VerificationApplication> {
    const app = this.applications.find((a) => a.id === id);
    if (!app) throw new Error('not found');
    return this.replace({
      ...app,
      status: 'rejected',
      reviewedByAdminId: adminId,
      reviewedAt,
      rejectionReason: reason,
      updatedAt: reviewedAt,
    });
  }

  async recordEvent(data: RecordEventData): Promise<VerificationEvent> {
    const event: VerificationEvent = {
      id: nextId('evt'),
      applicationId: data.applicationId,
      type: data.type,
      actorId: data.actorId,
      note: data.note ?? null,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
    };
    this.events.push(event);
    return event;
  }
}

export class FakeMembershipService implements MembershipService {
  readonly upgraded: string[] = [];
  readonly grants: DoctorVerificationGrant[] = [];
  private shouldFail = false;

  failNext(): void {
    this.shouldFail = true;
  }

  async grantDoctorVerified(grant: DoctorVerificationGrant): Promise<void> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error('membership upgrade failed');
    }
    this.grants.push(grant);
    this.upgraded.push(grant.userId);
  }
}

/**
 * Direct (non-atomic) transactor for tests. Runs the callback against the same
 * repo/membership instances. A `beforeCommit` hook lets a test simulate a
 * mid-transaction failure to assert rollback semantics at the service level.
 */
export class DirectTransactor implements Transactor {
  constructor(private readonly scope: TransactionScope) {}

  async run<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value = new Date(Date.UTC(2026, 0, 2, 3, 4, 5))) {}
  now(): Date {
    return this.value;
  }
}
