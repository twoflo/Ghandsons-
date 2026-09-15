import { pgTable, text, uuid, integer, boolean, index, timestamp, date } from "drizzle-orm/pg-core";
import {
  pk, timestamps, complianceSubject, complianceKind, incidentSeverity, safetyDocKind,
} from "./_shared";
import { users } from "./auth";
import { jobs } from "./jobs";
import { files } from "./files";

/**
 * Licences, insurances and tickets, for the business, each worker, each
 * subcontractor and each supplier. Expiry drives the dashboard warnings.
 */
export const complianceItems = pgTable(
  "compliance_items",
  {
    id: pk(),
    subjectType: complianceSubject("subject_type").notNull(),
    /** users.id / suppliers.id / null for the business itself. */
    subjectId: uuid("subject_id"),
    subjectLabel: text("subject_label").notNull(),
    kind: complianceKind("kind").notNull(),
    name: text("name").notNull(),
    identifier: text("identifier"),
    issuer: text("issuer"),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    /** Coverage amount for insurances, in cents. */
    coverageCents: integer("coverage_cents"),
    fileId: uuid("file_id").references(() => files.id),
    remindDaysBefore: integer("remind_days_before").notNull().default(30),
    isRequired: boolean("is_required").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("compliance_expiry_idx").on(t.expiryDate),
    index("compliance_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

export const complianceReminders = pgTable(
  "compliance_reminders",
  {
    id: pk(),
    complianceItemId: uuid("compliance_item_id")
      .notNull()
      .references(() => complianceItems.id, { onDelete: "cascade" }),
    dueOn: date("due_on").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("compliance_reminders_due_idx").on(t.dueOn)],
);

/** SWMS and friends, per job. */
export const safetyDocs = pgTable(
  "safety_docs",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    kind: safetyDocKind("kind").notNull().default("swms"),
    title: text("title").notNull(),
    version: text("version").notNull().default("1"),
    fileId: uuid("file_id").references(() => files.id),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    highRiskActivities: text("high_risk_activities").array().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("safety_docs_job_idx").on(t.jobId)],
);

export const safetySignoffs = pgTable(
  "safety_signoffs",
  {
    id: pk(),
    safetyDocId: uuid("safety_doc_id")
      .notNull()
      .references(() => safetyDocs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    signedName: text("signed_name").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("safety_signoffs_doc_idx").on(t.safetyDocId)],
);

export const incidents = pgTable(
  "incidents",
  {
    id: pk(),
    incidentNumber: text("incident_number").notNull(),
    jobId: uuid("job_id").references(() => jobs.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    severity: incidentSeverity("severity").notNull().default("near_miss"),
    personInvolved: text("person_involved"),
    description: text("description").notNull(),
    immediateAction: text("immediate_action"),
    correctiveAction: text("corrective_action"),
    reportedToAuthority: boolean("reported_to_authority").notNull().default(false),
    authorityReference: text("authority_reference"),
    status: text("status").notNull().default("open"), // open | investigating | closed
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reportedBy: uuid("reported_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("incidents_job_idx").on(t.jobId), index("incidents_date_idx").on(t.occurredAt)],
);
