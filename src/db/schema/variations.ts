import {
  pgTable, text, uuid, integer, index, timestamp, date, numeric,
} from "drizzle-orm/pg-core";
import { pk, timestamps, variationStatus, lineKind, cents, bp } from "./_shared";
import { users } from "./auth";
import { jobs } from "./jobs";
import { taxRates } from "./org";
import { files } from "./files";

/**
 * A scope change. Priced like a mini-quote, approved by the client, then
 * pushed onto an invoice with one tap — which is where most small builders
 * lose money, so approval state is tracked hard.
 */
export const variations = pgTable(
  "variations",
  {
    id: pk(),
    variationNumber: text("variation_number").notNull().unique(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    title: text("title").notNull(),
    description: text("description"),
    reason: text("reason"), // 'client_request' | 'site_condition' | 'design_change' | 'error'
    status: variationStatus("status").notNull().default("draft"),

    raisedOn: date("raised_on"),
    markupBp: bp("markup_bp"),
    costCents: cents("cost_cents"),
    subtotalCents: cents("subtotal_cents"),
    taxCents: cents("tax_cents"),
    totalCents: cents("total_cents"),

    /** Days added to the programme. Feeds the schedule warning. */
    timeImpactDays: integer("time_impact_days").notNull().default(0),

    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByName: text("approved_by_name"),
    approvalFileId: uuid("approval_file_id").references(() => files.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),

    invoiceId: uuid("invoice_id"),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),

    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("variations_job_idx").on(t.jobId), index("variations_status_idx").on(t.status)],
);

export const variationLines = pgTable(
  "variation_lines",
  {
    id: pk(),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => variations.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: lineKind("kind").notNull().default("material"),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    markupBp: integer("markup_bp"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineCostCents: cents("line_cost_cents"),
    lineSubtotalCents: cents("line_subtotal_cents"),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    lineTaxCents: cents("line_tax_cents"),
    lineTotalCents: cents("line_total_cents"),
    ...timestamps,
  },
  (t) => [index("variation_lines_variation_idx").on(t.variationId, t.sortOrder)],
);
