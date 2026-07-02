-- Doctor License Verification — initial migration (BBR-1127)
-- Additive: creates only doctor-verification objects. Safe to apply after the
-- base schema (BBR-1117) and auth/membership schema (BBR-1121) land.

DO $$ BEGIN
  CREATE TYPE "doctor_verification_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "doctor_verification_event_type" AS ENUM ('submitted', 'resubmitted', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "doctor_verification_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "applicant_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status" "doctor_verification_status" NOT NULL DEFAULT 'pending',
  "license_number" text NOT NULL,
  "license_name" text NOT NULL,
  "specialty" text,
  "proof_documents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rejection_reason" text,
  "reviewed_by_admin_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dv_applications_applicant_idx" ON "doctor_verification_applications" ("applicant_id");
CREATE INDEX IF NOT EXISTS "dv_applications_status_idx" ON "doctor_verification_applications" ("status");

CREATE TABLE IF NOT EXISTS "doctor_verification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "doctor_verification_applications"("id") ON DELETE CASCADE,
  "type" "doctor_verification_event_type" NOT NULL,
  "actor_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dv_events_application_idx" ON "doctor_verification_events" ("application_id");

-- Partial unique index: an applicant may have at most one non-rejected
-- application at a time (prevents duplicate pending / re-applying after approval).
CREATE UNIQUE INDEX IF NOT EXISTS "dv_applications_one_active_per_applicant"
  ON "doctor_verification_applications" ("applicant_id")
  WHERE ("status" IN ('pending', 'approved'));
