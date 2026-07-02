import { pgTable, uuid, text, timestamp, jsonb, index, pgEnum } from 'drizzle-orm/pg-core';
import { user } from '../../db/schema/auth.js';

/**
 * Doctor License Verification — persistence schema (Drizzle / Postgres).
 *
 * Two tables:
 *  - doctor_verification_applications: the current state of an applicant's request.
 *  - doctor_verification_events: append-only processing history (audit trail).
 *
 * Privacy note (see README): license/proof PII is minimized. Proof documents are
 * referenced by storage key only (Vercel Blob), never stored inline. Retention /
 * deletion policy is a confirmed follow-up (BBR-1127 Scope).
 */

export const doctorVerificationStatus = pgEnum('doctor_verification_status', [
  'pending',
  'approved',
  'rejected',
]);

export const doctorVerificationEventType = pgEnum('doctor_verification_event_type', [
  'submitted',
  'resubmitted',
  'approved',
  'rejected',
]);

export const doctorVerificationApplications = pgTable(
  'doctor_verification_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Applicant is a better-auth user (text ids).
    applicantId: text('applicant_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    status: doctorVerificationStatus('status').notNull().default('pending'),

    // Minimal license information (see privacy note).
    licenseNumber: text('license_number').notNull(),
    licenseName: text('license_name').notNull(),
    // Optional specialty / hospital affiliation supplied by applicant.
    specialty: text('specialty'),

    // Proof documents: array of storage references, NOT inline binaries.
    // Shape: { key: string; filename: string; contentType: string }
    proofDocuments: jsonb('proof_documents').notNull().default('[]'),

    // Populated on the terminal decision.
    rejectionReason: text('rejection_reason'),
    reviewedByAdminId: text('reviewed_by_admin_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    applicantIdx: index('dv_applications_applicant_idx').on(table.applicantId),
    statusIdx: index('dv_applications_status_idx').on(table.status),
  }),
);

export const doctorVerificationEvents = pgTable(
  'doctor_verification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => doctorVerificationApplications.id, { onDelete: 'cascade' }),
    type: doctorVerificationEventType('type').notNull(),
    // Actor: the applicant (for submit/resubmit) or an admin (for approve/reject).
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Free-form note; carries rejection reason for 'rejected' events.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    applicationIdx: index('dv_events_application_idx').on(table.applicationId),
  }),
);

export type DoctorVerificationApplicationRow = typeof doctorVerificationApplications.$inferSelect;
export type NewDoctorVerificationApplicationRow = typeof doctorVerificationApplications.$inferInsert;
export type DoctorVerificationEventRow = typeof doctorVerificationEvents.$inferSelect;
export type NewDoctorVerificationEventRow = typeof doctorVerificationEvents.$inferInsert;
