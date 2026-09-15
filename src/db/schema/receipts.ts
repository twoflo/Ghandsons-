import { pgTable, text, uuid, integer, index, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { pk, timestamps, receiptStatus } from "./_shared";
import { users } from "./auth";
import { files } from "./files";
import { expenses, suppliers } from "./finance";
import { jobs } from "./jobs";
import { expenseCategories } from "./org";

/** A bulk upload from the phone — "I emptied my ute of dockets". */
export const receiptBatches = pgTable("receipt_batches", {
  id: pk(),
  label: text("label"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

/**
 * One photographed receipt travelling through the pipeline:
 *
 *   uploaded -> processing -> needs_review -> approved
 *                          \-> failed
 *
 * `extraction` holds the structured result with a confidence score per field,
 * so the review screen can highlight exactly what the model was unsure about.
 * The raw OCR text and the model's own reasoning are kept for debugging and
 * so a later re-run can be compared against the original.
 */
export const receiptUploads = pgTable(
  "receipt_uploads",
  {
    id: pk(),
    batchId: uuid("batch_id").references(() => receiptBatches.id),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    status: receiptStatus("status").notNull().default("uploaded"),

    /* ---- pipeline provenance ---- */
    ocrProvider: text("ocr_provider"),
    ocrText: text("ocr_text"),
    ocrMs: integer("ocr_ms"),
    extractionProvider: text("extraction_provider"),
    extractionModel: text("extraction_model"),
    extractionMs: integer("extraction_ms"),
    attempts: integer("attempts").notNull().default(0),
    errorMessage: text("error_message"),

    /* ---- structured result (see ExtractedReceipt in src/lib/receipts/types.ts) ---- */
    extraction: jsonb("extraction"),
    /** 0-100. Lowest field confidence, used to sort the review queue. */
    overallConfidence: integer("overall_confidence"),
    /** True when subtotal + tax === total and GST looks like 1/11th of total. */
    arithmeticOk: boolean("arithmetic_ok"),

    /* ---- suggestions the reviewer can accept with one tap ---- */
    suggestedSupplierId: uuid("suggested_supplier_id").references(() => suppliers.id),
    suggestedJobId: uuid("suggested_job_id").references(() => jobs.id),
    suggestedCategoryId: uuid("suggested_category_id").references(() => expenseCategories.id),
    suggestionReason: text("suggestion_reason"),

    /* ---- outcome ---- */
    expenseId: uuid("expense_id").references(() => expenses.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Which fields the human changed — feeds the accuracy report in Settings. */
    correctedFields: jsonb("corrected_fields"),

    uploadedBy: uuid("uploaded_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("receipt_uploads_status_idx").on(t.status),
    index("receipt_uploads_batch_idx").on(t.batchId),
    index("receipt_uploads_expense_idx").on(t.expenseId),
  ],
);
