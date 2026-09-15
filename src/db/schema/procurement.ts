import {
  pgTable, text, uuid, integer, index, timestamp, date, numeric,
} from "drizzle-orm/pg-core";
import { pk, timestamps, poStatus, cents } from "./_shared";
import { users } from "./auth";
import { jobs } from "./jobs";
import { suppliers, expenses } from "./finance";
import { taxRates, priceBookItems } from "./org";
import { files } from "./files";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: pk(),
    poNumber: text("po_number").notNull().unique(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    status: poStatus("status").notNull().default("draft"),
    orderDate: date("order_date"),
    expectedDate: date("expected_date"),
    deliverTo: text("deliver_to"),
    subtotalCents: cents("subtotal_cents"),
    taxCents: cents("tax_cents"),
    totalCents: cents("total_cents"),
    notes: text("notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    pdfFileId: uuid("pdf_file_id").references(() => files.id),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("po_supplier_idx").on(t.supplierId),
    index("po_job_idx").on(t.jobId),
    index("po_status_idx").on(t.status),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: pk(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    priceBookItemId: uuid("price_book_item_id").references(() => priceBookItems.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    lineSubtotalCents: cents("line_subtotal_cents"),
    lineTaxCents: cents("line_tax_cents"),
    lineTotalCents: cents("line_total_cents"),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    ...timestamps,
  },
  (t) => [index("po_lines_po_idx").on(t.purchaseOrderId, t.sortOrder)],
);

/** A delivery. Photograph the docket, tick off what turned up. */
export const purchaseOrderReceipts = pgTable(
  "purchase_order_receipts",
  {
    id: pk(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    receivedOn: date("received_on").notNull(),
    docketNumber: text("docket_number"),
    fileId: uuid("file_id").references(() => files.id),
    notes: text("notes"),
    receivedBy: uuid("received_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("po_receipts_po_idx").on(t.purchaseOrderId)],
);

export const purchaseOrderReceiptLines = pgTable("purchase_order_receipt_lines", {
  id: pk(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => purchaseOrderReceipts.id, { onDelete: "cascade" }),
  purchaseOrderLineId: uuid("purchase_order_line_id")
    .notNull()
    .references(() => purchaseOrderLines.id),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
  ...timestamps,
});

/** Links a supplier invoice/expense to the PO it settles (three-way match). */
export const purchaseOrderMatches = pgTable(
  "purchase_order_matches",
  {
    id: pk(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    matchedAmountCents: integer("matched_amount_cents").notNull().default(0),
    /** total on the expense minus total ordered — surfaced as a warning. */
    varianceCents: integer("variance_cents").notNull().default(0),
    matchedBy: uuid("matched_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("po_matches_po_idx").on(t.purchaseOrderId)],
);
