import { pgTable, text, uuid, boolean, index, timestamp } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { users } from "./auth";
import { jobs } from "./jobs";
import { sites } from "./clients";

/**
 * A block of work on the calendar. Dragging a job onto a day creates one of
 * these; dragging it again just moves startAt/endAt.
 */
export const scheduleEvents = pgTable(
  "schedule_events",
  {
    id: pk(),
    jobId: uuid("job_id").references(() => jobs.id),
    siteId: uuid("site_id").references(() => sites.id),
    title: text("title").notNull(),
    /** 'work' | 'leave' | 'delivery' | 'inspection' | 'other' */
    kind: text("kind").notNull().default("work"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(true),
    notes: text("notes"),
    colour: text("colour"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("schedule_events_range_idx").on(t.startAt, t.endAt),
    index("schedule_events_job_idx").on(t.jobId),
  ],
);

/** Who is on that block. Overlaps here are what the double-booking check finds. */
export const scheduleAssignments = pgTable(
  "schedule_assignments",
  {
    id: pk(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduleEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("schedule_assignments_event_idx").on(t.eventId),
    index("schedule_assignments_user_idx").on(t.userId),
  ],
);
