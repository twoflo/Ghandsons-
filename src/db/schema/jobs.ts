import { pgTable, text, uuid, integer, boolean, index, timestamp, date } from "drizzle-orm/pg-core";
import { pk, timestamps, jobStatus, cents, bp } from "./_shared";
import { users } from "./auth";
import { clients, sites } from "./clients";
import { jobTypes } from "./org";

/**
 * The hub of the whole app. Quotes, invoices, expenses, time, POs, photos,
 * variations, safety docs and incidents all point back here.
 *
 * Budget is stored on the job (set when a quote converts, editable after).
 * Actuals are NOT stored — they are derived in `jobCostSummary` so they can
 * never drift from the underlying time entries and expenses.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: pk(),
    jobNumber: text("job_number").notNull().unique(),
    title: text("title").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    siteId: uuid("site_id").references(() => sites.id),
    jobTypeId: uuid("job_type_id").references(() => jobTypes.id),
    status: jobStatus("status").notNull().default("lead"),
    description: text("description"),
    /** Owner-facing priority flag for the dashboard. */
    isPriority: boolean("is_priority").notNull().default(false),

    startDate: date("start_date"),
    endDate: date("end_date"),
    actualStartDate: date("actual_start_date"),
    actualEndDate: date("actual_end_date"),

    /** Agreed value of the work, ex GST. Set from the accepted quote. */
    contractValueCents: cents("contract_value_cents"),
    budgetLabourCents: cents("budget_labour_cents"),
    budgetMaterialCents: cents("budget_material_cents"),
    budgetSubcontractorCents: cents("budget_subcontractor_cents"),
    budgetPlantCents: cents("budget_plant_cents"),
    budgetOtherCents: cents("budget_other_cents"),
    targetMarginBp: bp("target_margin_bp"),

    sourceQuoteId: uuid("source_quote_id"),
    leadSource: text("lead_source"),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_client_idx").on(t.clientId),
    index("jobs_dates_idx").on(t.startDate, t.endDate),
  ],
);

export const jobStatusHistory = pgTable(
  "job_status_history",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    changedBy: uuid("changed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_status_history_job_idx").on(t.jobId)],
);

/** Standing crew assignment (who is on this job generally). Day-by-day
 *  allocation lives in schedule_assignments. */
export const jobAssignments = pgTable(
  "job_assignments",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleOnJob: text("role_on_job"), // 'lead' | 'crew' | 'apprentice' | 'supervisor'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("job_assignments_job_idx").on(t.jobId),
    index("job_assignments_user_idx").on(t.userId),
  ],
);

/** Short running notes pinned to the job timeline. */
export const jobNotes = pgTable(
  "job_notes",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("job_notes_job_idx").on(t.jobId)],
);

export const jobPhotos = pgTable(
  "job_photos",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    fileId: uuid("file_id").notNull(),
    caption: text("caption"),
    category: text("category").notNull().default("progress"),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    latitude: text("latitude"),
    longitude: text("longitude"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("job_photos_job_idx").on(t.jobId, t.takenAt)],
);
