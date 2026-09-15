import { pgTable, text, timestamp, boolean, uuid, index, integer } from "drizzle-orm/pg-core";
import { pk, timestamps, userRole, employmentType, cents } from "./_shared";

export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: userRole("role").notNull().default("field"),
    isActive: boolean("is_active").notNull().default(true),
    /** Forces a password change on next login (used for seeded/invited accounts). */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    avatarFileId: uuid("avatar_file_id"),
    ...timestamps,
  },
  (t) => [index("users_role_idx").on(t.role)],
);

/** Server-side sessions. Cookie holds an opaque token; nothing sensitive client-side. */
export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expiry_idx").on(t.expiresAt)],
);

/**
 * Pay/charge rates and employment details for anyone who books time.
 * Split from `users` because most of it is commercially sensitive and only
 * Owner/Office may read it.
 */
export const workerProfiles = pgTable("worker_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  employmentType: employmentType("employment_type").notNull().default("employee"),
  /** What this person costs the business per hour. */
  costRateCents: cents("cost_rate_cents"),
  /** What the client is charged per hour. */
  chargeRateCents: cents("charge_rate_cents"),
  standardHoursPerWeek: integer("standard_hours_per_week").notNull().default(38),
  trade: text("trade"),
  abn: text("abn"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  startDate: text("start_date"),
  notes: text("notes"),
  ...timestamps,
});

/** Password reset + invite tokens. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // 'reset' | 'invite'
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);
