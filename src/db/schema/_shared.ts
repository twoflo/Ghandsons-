import { pgEnum, timestamp, uuid, integer, text } from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Conventions
 * ------------------------------------------------------------------ *
 * - All money is stored as INTEGER CENTS (AUD). Never floats.
 * - All percentages/rates are stored as INTEGER BASIS POINTS.
 *     1000 bp = 10.00%  (GST)   |  1500 bp = 15.00% (margin)
 * - Quantities are numeric(14,3) so 0.5 hrs / 2.25 m3 are exact.
 * - Every business table is soft-deleted via `deletedAt`.
 * - Every financial table is covered by the audit_log trigger helpers
 *   in src/lib/audit.ts.
 * ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["owner", "office", "field"]);

export const jobStatus = pgEnum("job_status", [
  "lead",
  "quoted",
  "won",
  "scheduled",
  "in_progress",
  "complete",
  "invoiced",
  "paid",
  "lost",
  "cancelled",
]);

export const clientType = pgEnum("client_type", ["individual", "company"]);

export const lineKind = pgEnum("line_kind", [
  "labour",
  "material",
  "subcontractor",
  "plant",
  "other",
]);

export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "superseded",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "part_paid",
  "paid",
  "overdue",
  "void",
]);

export const invoiceType = pgEnum("invoice_type", [
  "standard",
  "deposit",
  "progress",
  "final",
]);

export const paymentMethod = pgEnum("payment_method", [
  "bank_transfer",
  "card",
  "cash",
  "cheque",
  "direct_debit",
  "other",
]);

export const timeEntryStatus = pgEnum("time_entry_status", [
  "open",
  "draft",
  "submitted",
  "approved",
  "rejected",
]);

export const timeEntrySource = pgEnum("time_entry_source", ["clock", "manual", "import"]);

export const employmentType = pgEnum("employment_type", ["employee", "subcontractor"]);

export const receiptStatus = pgEnum("receipt_status", [
  "uploaded",
  "processing",
  "needs_review",
  "approved",
  "failed",
  "discarded",
]);

export const expenseSource = pgEnum("expense_source", [
  "manual",
  "receipt",
  "purchase_order",
  "import",
]);

export const poStatus = pgEnum("po_status", [
  "draft",
  "sent",
  "part_received",
  "received",
  "invoiced",
  "cancelled",
]);

export const variationStatus = pgEnum("variation_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "invoiced",
]);

export const complianceSubject = pgEnum("compliance_subject", [
  "business",
  "worker",
  "subcontractor",
  "supplier",
]);

export const complianceKind = pgEnum("compliance_kind", [
  "licence",
  "insurance",
  "certification",
  "registration",
  "induction",
]);

export const incidentSeverity = pgEnum("incident_severity", [
  "near_miss",
  "first_aid",
  "minor",
  "serious",
  "notifiable",
]);

export const safetyDocKind = pgEnum("safety_doc_kind", [
  "swms",
  "jsa",
  "permit",
  "toolbox_talk",
  "risk_assessment",
]);

export const photoCategory = pgEnum("photo_category", [
  "progress",
  "defect",
  "before",
  "after",
  "compliance",
  "other",
]);

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "restore",
  "status_change",
  "send",
  "payment",
  "approve",
  "reject",
]);

export const interactionKind = pgEnum("interaction_kind", [
  "call",
  "email",
  "sms",
  "meeting",
  "site_visit",
  "note",
]);

/* ---------------------------- column helpers ---------------------------- */

export const pk = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

/** An AUD amount in whole cents. */
export const cents = (name: string) => integer(name).notNull().default(0);
export const centsNullable = (name: string) => integer(name);
/** A rate in basis points: 1000 = 10.00%. */
export const bp = (name: string) => integer(name).notNull().default(0);

export const addressColumns = {
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  suburb: text("suburb"),
  state: text("state"),
  postcode: text("postcode"),
  country: text("country").default("Australia"),
};
