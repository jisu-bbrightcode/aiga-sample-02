/**
 * Concrete MembershipService backed by the auth/membership schema (BBR-1121).
 *
 * `grantDoctorVerified` upserts the applicant's `profiles` row to:
 *   - tier -> 'verified_doctor' (의사인증회원)
 *   - isExpert -> true, expertBadge -> 'verified_doctor'
 *   - specialty / licenseNumber / licenseVerifiedAt populated from the approved
 *     application (these badge columns are reserved for this feature; see
 *     db/schema/profiles.ts).
 *
 * The DB handle is injected so the upgrade participates in the approval
 * transaction (via DrizzleTransactor.membershipFactory) and is therefore atomic
 * with the application status change. The upsert makes it idempotent per user.
 */
import { profiles } from '../../db/schema/profiles.js';
import type { DrizzleDb } from './drizzle-repository.js';
import type { DoctorVerificationGrant, MembershipService } from './ports.js';

const VERIFIED_DOCTOR_TIER = 'verified_doctor';
const EXPERT_BADGE = 'verified_doctor';

export class DrizzleDoctorMembershipService implements MembershipService {
  constructor(private readonly db: DrizzleDb) {}

  async grantDoctorVerified(grant: DoctorVerificationGrant): Promise<void> {
    await this.db
      .insert(profiles)
      .values({
        userId: grant.userId,
        tier: VERIFIED_DOCTOR_TIER,
        isExpert: true,
        expertBadge: EXPERT_BADGE,
        specialty: grant.specialty,
        licenseNumber: grant.licenseNumber,
        licenseVerifiedAt: grant.verifiedAt,
        updatedAt: grant.verifiedAt,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          tier: VERIFIED_DOCTOR_TIER,
          isExpert: true,
          expertBadge: EXPERT_BADGE,
          specialty: grant.specialty,
          licenseNumber: grant.licenseNumber,
          licenseVerifiedAt: grant.verifiedAt,
          updatedAt: grant.verifiedAt,
        },
      });
  }
}

/** Factory used by DrizzleTransactor to bind the service to a tx handle. */
export const doctorMembershipFactory = (tx: DrizzleDb): MembershipService =>
  new DrizzleDoctorMembershipService(tx);
