import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { PROFILE_TIERS } from "../../membership/tiers.js";
import { user } from "./auth.js";

/**
 * Membership tier enum, derived from the canonical `PROFILE_TIERS` list so the
 * DB enum and the domain model share one source of truth.
 */
export const membershipTierEnum = pgEnum("membership_tier", PROFILE_TIERS);

/**
 * Profile extension over the better-auth `user` table.
 *
 * Holds the membership tier (등급) plus the expert (doctor) badge fields. The
 * badge fields are populated by the doctor-license verification feature
 * (BBR-1127); this module only owns the columns and their defaults.
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),

    // 3-tier membership grade. `guest` is implicit (no row) — see tiers.ts.
    tier: membershipTierEnum("tier").notNull().default("member"),

    displayName: text("display_name"),

    // --- Expert (doctor) badge fields ---------------------------------------
    isExpert: boolean("is_expert").notNull().default(false),
    expertBadge: text("expert_badge"), // e.g. "verified_doctor"
    specialty: text("specialty"), // 진료과목
    licenseNumber: text("license_number"),
    licenseVerifiedAt: timestamp("license_verified_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tierIdx: index("profiles_tier_idx").on(table.tier),
  }),
);

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
