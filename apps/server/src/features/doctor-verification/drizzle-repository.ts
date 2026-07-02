/**
 * Drizzle-backed adapters for the persistence + transaction ports.
 *
 * `DrizzleDb` is intentionally a minimal structural type so this module does not
 * pin a specific driver — the base (BBR-1117) supplies the concrete
 * `drizzle(...)` instance. When wiring, pass that instance in.
 */
import { and, asc, count, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  doctorVerificationApplications as apps,
  doctorVerificationEvents as events,
  type DoctorVerificationApplicationRow,
} from './schema.js';
import type {
  DoctorVerificationRepository,
  InsertApplicationData,
  MembershipService,
  RecordEventData,
  Transactor,
  TransactionScope,
} from './ports.js';
import type {
  ListApplicationsQuery,
  Paginated,
  ProofDocumentRef,
  VerificationApplication,
  VerificationEvent,
} from './types.js';

/** Minimal structural surface of a drizzle db/transaction handle we rely on. */
export interface DrizzleDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction: <T>(fn: (tx: DrizzleDb) => Promise<T>) => Promise<T>;
}

const toApplication = (row: DoctorVerificationApplicationRow): VerificationApplication => ({
  id: row.id,
  applicantId: row.applicantId,
  status: row.status,
  license: {
    licenseNumber: row.licenseNumber,
    licenseName: row.licenseName,
    specialty: row.specialty ?? null,
  },
  proofDocuments: (row.proofDocuments as ProofDocumentRef[] | null) ?? [],
  rejectionReason: row.rejectionReason ?? null,
  reviewedByAdminId: row.reviewedByAdminId ?? null,
  reviewedAt: row.reviewedAt ?? null,
  proofPurgedAt: row.proofPurgedAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleDoctorVerificationRepository implements DoctorVerificationRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findLatestByApplicant(applicantId: string): Promise<VerificationApplication | undefined> {
    const rows = await this.db
      .select()
      .from(apps)
      .where(eq(apps.applicantId, applicantId))
      .orderBy(desc(apps.createdAt))
      .limit(1);
    return rows[0] ? toApplication(rows[0]) : undefined;
  }

  async findById(id: string): Promise<VerificationApplication | undefined> {
    const rows = await this.db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return rows[0] ? toApplication(rows[0]) : undefined;
  }

  async list(query: ListApplicationsQuery): Promise<Paginated<VerificationApplication>> {
    const where = query.status ? eq(apps.status, query.status) : undefined;
    const rows = await this.db
      .select()
      .from(apps)
      .where(where)
      .orderBy(desc(apps.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    const totalRows = await this.db.select({ value: count() }).from(apps).where(where);
    return {
      items: rows.map(toApplication),
      total: Number(totalRows[0]?.value ?? 0),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async insert(data: InsertApplicationData): Promise<VerificationApplication> {
    const rows = await this.db
      .insert(apps)
      .values({
        applicantId: data.applicantId,
        status: 'pending',
        licenseNumber: data.license.licenseNumber,
        licenseName: data.license.licenseName,
        specialty: data.license.specialty,
        proofDocuments: data.proofDocuments as unknown,
      })
      .returning();
    return toApplication(rows[0]);
  }

  async markApproved(
    id: string,
    adminId: string,
    reviewedAt: Date,
  ): Promise<VerificationApplication> {
    const rows = await this.db
      .update(apps)
      .set({
        status: 'approved',
        reviewedByAdminId: adminId,
        reviewedAt,
        rejectionReason: null,
        updatedAt: reviewedAt,
      })
      .where(and(eq(apps.id, id), eq(apps.status, 'pending')))
      .returning();
    return toApplication(rows[0]);
  }

  async markRejected(
    id: string,
    adminId: string,
    reason: string,
    reviewedAt: Date,
  ): Promise<VerificationApplication> {
    const rows = await this.db
      .update(apps)
      .set({
        status: 'rejected',
        reviewedByAdminId: adminId,
        reviewedAt,
        rejectionReason: reason,
        updatedAt: reviewedAt,
      })
      .where(and(eq(apps.id, id), eq(apps.status, 'pending')))
      .returning();
    return toApplication(rows[0]);
  }

  async recordEvent(data: RecordEventData): Promise<VerificationEvent> {
    const rows = await this.db
      .insert(events)
      .values({
        applicationId: data.applicationId,
        type: data.type,
        actorId: data.actorId,
        note: data.note ?? null,
      })
      .returning();
    const row = rows[0];
    return {
      id: row.id,
      applicationId: row.applicationId,
      type: row.type,
      actorId: row.actorId,
      note: row.note ?? null,
      createdAt: row.createdAt,
    };
  }

  async findProofPurgeCandidates(
    reviewedBefore: Date,
    limit: number,
  ): Promise<ReadonlyArray<VerificationApplication>> {
    const rows = await this.db
      .select()
      .from(apps)
      .where(
        and(
          inArray(apps.status, ['approved', 'rejected']),
          isNull(apps.proofPurgedAt),
          lte(apps.reviewedAt, reviewedBefore),
          // Skip rows whose proof array is already empty (nothing to delete).
          sql`jsonb_array_length(${apps.proofDocuments}) > 0`,
        ),
      )
      .orderBy(asc(apps.reviewedAt))
      .limit(limit);
    return rows.map(toApplication);
  }

  async listProofKeysByApplicant(applicantId: string): Promise<ReadonlyArray<string>> {
    const rows = await this.db
      .select({ proofDocuments: apps.proofDocuments })
      .from(apps)
      .where(and(eq(apps.applicantId, applicantId), isNull(apps.proofPurgedAt)));
    return rows.flatMap((row: { proofDocuments: unknown }) =>
      ((row.proofDocuments as ProofDocumentRef[] | null) ?? []).map((doc) => doc.key),
    );
  }

  async clearProofDocuments(id: string, purgedAt: Date): Promise<void> {
    await this.db
      .update(apps)
      .set({ proofDocuments: [] as unknown, proofPurgedAt: purgedAt, updatedAt: purgedAt })
      .where(and(eq(apps.id, id), isNull(apps.proofPurgedAt)));
  }
}

/**
 * Drizzle transactor. Wraps db.transaction and rebinds the repository +
 * membership service to the tx handle so the approval flow is atomic.
 * `membershipFactory` lets BBR-1121's MembershipService participate in the tx.
 */
export class DrizzleTransactor implements Transactor {
  constructor(
    private readonly db: DrizzleDb,
    private readonly membershipFactory: (tx: DrizzleDb) => MembershipService,
  ) {}

  run<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn({
        repo: new DrizzleDoctorVerificationRepository(tx),
        membership: this.membershipFactory(tx),
      }),
    );
  }
}
