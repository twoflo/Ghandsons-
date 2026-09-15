import {
  pgTable, text, uuid, integer, index, timestamp, date, boolean,
} from "drizzle-orm/pg-core";
import { pk, timestamps, timeEntryStatus, timeEntrySource, cents } from "./_shared";
import { users } from "./auth";
import { jobs } from "./jobs";

/**
 * One shift, or one manual line on a timesheet.
 *
 * `endedAt` null + status 'open' means the worker is clocked on right now.
 * Rates are SNAPSHOTTED at approval so a later pay rise never rewrites the
 * cost of a job that has already been reported on.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    jobId: uuid("job_id").references(() => jobs.id),
    workDate: date("work_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    breakMinutes: integer("break_minutes").notNull().default(0),
    /** Authoritative duration. Derived from start/end on clock-out, typed directly on manual entry. */
    minutes: integer("minutes").notNull().default(0),

    description: text("description"),
    status: timeEntryStatus("status").notNull().default("draft"),
    source: timeEntrySource("source").notNull().default("manual"),

    costRateCents: cents("cost_rate_cents"),
    chargeRateCents: cents("charge_rate_cents"),
    /** minutes/60 * costRateCents, rounded to the cent. Flows into job actuals. */
    costCents: cents("cost_cents"),
    chargeCents: cents("charge_cents"),

    startLatitude: text("start_latitude"),
    startLongitude: text("start_longitude"),
    endLatitude: text("end_latitude"),
    endLongitude: text("end_longitude"),

    timesheetWeekId: uuid("timesheet_week_id"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),

    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("time_entries_user_date_idx").on(t.userId, t.workDate),
    index("time_entries_job_idx").on(t.jobId),
    index("time_entries_status_idx").on(t.status),
  ],
);

/** A Mon-Sun bundle for one worker; the unit the owner approves. */
export const timesheetWeeks = pgTable(
  "timesheet_weeks",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    weekStart: date("week_start").notNull(),
    status: timeEntryStatus("status").notNull().default("draft"),
    totalMinutes: integer("total_minutes").notNull().default(0),
    totalCostCents: cents("total_cost_cents"),
    totalChargeCents: cents("total_charge_cents"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    lockedForPayroll: boolean("locked_for_payroll").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("timesheet_weeks_user_idx").on(t.userId, t.weekStart)],
);
