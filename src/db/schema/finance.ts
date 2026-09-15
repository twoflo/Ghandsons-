import {
  pgTable, text, uuid, integer, boolean, index, timestamp, date, numeric, jsonb,
} from "drizzle-orm/pg-core";
import {
  pk, timestamps, invoiceStatus, invoiceType, paymentMethod, expenseSource, cents,
} from "./_shared";
import { users } from "./auth";
import { clients, sites, contacts } from "./clients";
import { jobs } from "./jobs";
import { taxRates, expenseCategories } from "./org";
import { files } from "./files";

/* --------------------------------- invoices -------------------------------- */

export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    jobId: uuid("job_id").references(() => jobs.id),
    siteId: uuid("site_id").references(() => sites.id),
    contactId: uuid("contact_id").references(() => contacts.id),

    type: invoiceType("type").notNull().default("standard"),
    status: invoiceStatus("status").notNull().default("draft"),

    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(14),

    /** For progress claims: this claim is for N% of the contract to date. */
    progressPercentBp: integer("progress_percent_bp"),
    previouslyClaimedCents: cents("previously_claimed_cents"),

    subtotalCents: cents("subtotal_cents"),
    taxCents: cents("tax_cents"),
    totalCents: cents("total_cents"),
    /** Maintained by recalcInvoicePayments() whenever a payment changes. */
    amountPaidCents: cents("amount_paid_cents"),
    balanceCents: cents("balance_cents"),

    reference: text("reference"),
    notes: text("notes"),
    terms: text("terms"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    pdfFileId: uuid("pdf_file_id").references(() => files.id),

    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("invoices_client_idx").on(t.clientId),
    index("invoices_job_idx").on(t.jobId),
    index("invoices_status_idx").on(t.status),
    index("invoices_due_idx").on(t.dueDate),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: pk(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isHeading: integer("is_heading").notNull().default(0),

    /** Provenance so we never bill the same thing twice.
     *  'manual' | 'quote_line' | 'variation' | 'expense' | 'time_entry' | 'deposit' | 'progress' */
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),

    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineSubtotalCents: cents("line_subtotal_cents"),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    lineTaxCents: cents("line_tax_cents"),
    lineTotalCents: cents("line_total_cents"),
    ...timestamps,
  },
  (t) => [
    index("invoice_lines_invoice_idx").on(t.invoiceId, t.sortOrder),
    index("invoice_lines_source_idx").on(t.sourceType, t.sourceId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountCents: integer("amount_cents").notNull(),
    paidOn: date("paid_on").notNull(),
    method: paymentMethod("method").notNull().default("bank_transfer"),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

/* --------------------------------- expenses -------------------------------- */

export const suppliers = pgTable(
  "suppliers",
  {
    id: pk(),
    name: text("name").notNull(),
    abn: text("abn"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    addressLine1: text("address_line1"),
    suburb: text("suburb"),
    state: text("state"),
    postcode: text("postcode"),
    accountNumber: text("account_number"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    defaultCategoryId: uuid("default_category_id").references(() => expenseCategories.id),
    contactName: text("contact_name"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

/** Alternative spellings seen on receipts ("BUNNINGS WHSE 4021" -> Bunnings). */
export const supplierAliases = pgTable(
  "supplier_aliases",
  {
    id: pk(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplier_aliases_supplier_idx").on(t.supplierId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: pk(),
    reference: text("reference"),
    jobId: uuid("job_id").references(() => jobs.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    categoryId: uuid("category_id").references(() => expenseCategories.id),
    purchaseOrderId: uuid("purchase_order_id"),

    expenseDate: date("expense_date").notNull(),
    description: text("description").notNull(),
    supplierNameRaw: text("supplier_name_raw"),

    subtotalCents: cents("subtotal_cents"),
    taxCents: cents("tax_cents"),
    totalCents: cents("total_cents"),

    /** Billable expenses can be pulled onto an invoice; markup applied there. */
    isBillable: boolean("is_billable").notNull().default(true),
    billedInvoiceLineId: uuid("billed_invoice_line_id"),

    paymentMethod: paymentMethod("payment_method").notNull().default("card"),
    source: expenseSource("source").notNull().default("manual"),
    /** The photographed receipt. Kept forever. */
    receiptFileId: uuid("receipt_file_id").references(() => files.id),
    receiptUploadId: uuid("receipt_upload_id"),

    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("expenses_job_idx").on(t.jobId),
    index("expenses_date_idx").on(t.expenseDate),
    index("expenses_supplier_idx").on(t.supplierId),
    index("expenses_billable_idx").on(t.isBillable, t.billedInvoiceLineId),
  ],
);

/** Individual items read off a receipt. Optional — a receipt can be a single total. */
export const expenseLines = pgTable(
  "expense_lines",
  {
    id: pk(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineTotalCents: cents("line_total_cents"),
    /** Per-line confidence from the extractor, 0-100. */
    extractionConfidence: integer("extraction_confidence"),
    meta: jsonb("meta"),
    ...timestamps,
  },
  (t) => [index("expense_lines_expense_idx").on(t.expenseId, t.sortOrder)],
);
