-- Doctor License Verification — retention/deletion policy (BBR-1167)
-- Additive + idempotent. Follows BBR-1127 (0001_doctor_verification.sql).
--
-- Adds a purge marker so the scheduled retention job can delete aged proof
-- blobs and clear `proof_documents` exactly once per application, and a partial
-- index to make the "terminal + not yet purged" candidate scan cheap.

-- 1) Purge marker column (NULL = proofs still retained).
ALTER TABLE "doctor_verification_applications"
  ADD COLUMN IF NOT EXISTS "proof_purged_at" timestamptz;

-- 2) Partial index for the retention purge scan. Only indexes rows that are
--    still candidates (not yet purged); ordered by the review timestamp used to
--    compute the retention cutoff.
CREATE INDEX IF NOT EXISTS "dv_applications_proof_retention_idx"
  ON "doctor_verification_applications" ("status", "reviewed_at")
  WHERE "proof_purged_at" IS NULL;
