import { pgTable, text, uuid, integer, index, timestamp, date, numeric } from "drizzle-orm/pg-core";
import { pk, timestamps, quoteStatus, lineKind, cents, bp } from "./_shared";
import { users } from "./auth";
import { clients, sites, contacts } from "./clients";
import { jobs } from "./jobs";
import { taxRates, priceBookItems } from "./org";

/**
 * Money on a quote flows: unit cost -> markup -> unit price -> line total.
 * Every derived figure is recomputed server-side from cost + markup + qty on
 * every save; the stored totals exist so PDFs and lists stay fast and so an
 * accepted quote is frozen exactly as the client saw it.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: pk(),
    quoteNumber: text("quote_number").notNull().unique(),
    revision: integer("revision").notNull().default(1),
    supersedesQuoteId: uuid("supersedes_quote_id"),

    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    siteId: uuid("site_id").references(() => sites.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    /** Set once the quote is won and converted. */
    jobId: uuid("job_id").references(() => jobs.id),

    title: text("title").notNull(),
    status: quoteStatus("status").notNull().default("draft"),
    issueDate: date("issue_date"),
    validUntil: date("valid_until"),

    /** Applied to any line whose own markup is null. */
    globalMarkupBp: bp("global_markup_bp"),

    subtotalCents: cents("subtotal_cents"),
    taxCents: cents("tax_cents"),
    totalCents: cents("total_cents"),
    /** Sum of line unit costs — what the job should cost us to deliver. */
    costTotalCents: cents("cost_total_cents"),

    scopeOfWork: text("scope_of_work"),
    exclusions: text("exclusions"),
    terms: text("terms"),
    internalNotes: text("internal_notes"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByName: text("accepted_by_name"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    pdfFileId: uuid("pdf_file_id"),

    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("quotes_client_idx").on(t.clientId),
    index("quotes_status_idx").on(t.status),
    index("quotes_job_idx").on(t.jobId),
  ],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: pk(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Section heading rows carry only a description. */
    isHeading: integer("is_heading").notNull().default(0),

    priceBookItemId: uuid("price_book_item_id").references(() => priceBookItems.id),
    kind: lineKind("kind").notNull().default("material"),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),

    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    /** null = inherit the quote's globalMarkupBp. */
    markupBp: integer("markup_bp"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),

    lineCostCents: cents("line_cost_cents"),
    lineSubtotalCents: cents("line_subtotal_cents"),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    lineTaxCents: cents("line_tax_cents"),
    lineTotalCents: cents("line_total_cents"),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId, t.sortOrder)],
);
