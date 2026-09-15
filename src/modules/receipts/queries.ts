import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ExtractedReceipt } from "@/lib/receipts/types";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type ReceiptQueueItem = {
  id: string;
  status: string;
  fileId: string;
  filename: string;
  mimeType: string;
  overallConfidence: number | null;
  arithmeticOk: boolean | null;
  errorMessage: string | null;
  supplierGuess: string | null;
  totalCents: number | null;
  receiptDate: string | null;
  suggestedJobNumber: string | null;
  suggestedCategoryName: string | null;
  uploadedByName: string | null;
  createdAt: string;
  batchId: string | null;
  expenseId: string | null;
};

export async function listReceiptQueue(
  status?: "needs_review" | "processing" | "failed" | "approved" | "all",
): Promise<ReceiptQueueItem[]> {
  const filter = status ?? "needs_review";
  return rows<ReceiptQueueItem>(sql`
    SELECT
      r.id, r.status::text AS status, r.file_id AS "fileId",
      f.filename, f.mime_type AS "mimeType",
      r.overall_confidence AS "overallConfidence",
      r.arithmetic_ok AS "arithmeticOk",
      r.error_message AS "errorMessage",
      (r.extraction -> 'supplierName' ->> 'value') AS "supplierGuess",
      NULLIF(r.extraction -> 'totalCents' ->> 'value', '')::int AS "totalCents",
      (r.extraction -> 'date' ->> 'value') AS "receiptDate",
      j.job_number AS "suggestedJobNumber",
      ec.name AS "suggestedCategoryName",
      u.full_name AS "uploadedByName",
      r.created_at::text AS "createdAt",
      r.batch_id AS "batchId",
      r.expense_id AS "expenseId"
    FROM receipt_uploads r
    JOIN files f ON f.id = r.file_id
    LEFT JOIN jobs j ON j.id = r.suggested_job_id
    LEFT JOIN expense_categories ec ON ec.id = r.suggested_category_id
    LEFT JOIN users u ON u.id = r.uploaded_by
    WHERE r.deleted_at IS NULL
      ${filter === "all"
        ? sql``
        : filter === "processing"
          ? sql`AND r.status IN ('uploaded','processing')`
          : sql`AND r.status::text = ${filter}`}
    ORDER BY
      CASE r.status WHEN 'failed' THEN 0 WHEN 'needs_review' THEN 1 ELSE 2 END,
      r.overall_confidence ASC NULLS FIRST,
      r.created_at ASC
    LIMIT 200
  `);
}

export type ReceiptReview = {
  id: string;
  status: string;
  fileId: string;
  filename: string;
  mimeType: string;
  extraction: ExtractedReceipt | null;
  ocrText: string | null;
  overallConfidence: number | null;
  arithmeticOk: boolean | null;
  errorMessage: string | null;
  extractionProvider: string | null;
  extractionModel: string | null;
  extractionMs: number | null;
  attempts: number;
  suggestedSupplierId: string | null;
  suggestedCategoryId: string | null;
  suggestedJobId: string | null;
  suggestionReason: string | null;
  uploadedByName: string | null;
  createdAt: string;
  batchId: string | null;
  expenseId: string | null;
};

export async function getReceipt(id: string): Promise<ReceiptReview | null> {
  const [row] = await rows<ReceiptReview>(sql`
    SELECT
      r.id, r.status::text AS status, r.file_id AS "fileId",
      f.filename, f.mime_type AS "mimeType",
      r.extraction, r.ocr_text AS "ocrText",
      r.overall_confidence AS "overallConfidence",
      r.arithmetic_ok AS "arithmeticOk",
      r.error_message AS "errorMessage",
      r.extraction_provider AS "extractionProvider",
      r.extraction_model AS "extractionModel",
      r.extraction_ms AS "extractionMs",
      r.attempts,
      r.suggested_supplier_id AS "suggestedSupplierId",
      r.suggested_category_id AS "suggestedCategoryId",
      r.suggested_job_id AS "suggestedJobId",
      r.suggestion_reason AS "suggestionReason",
      u.full_name AS "uploadedByName",
      r.created_at::text AS "createdAt",
      r.batch_id AS "batchId",
      r.expense_id AS "expenseId"
    FROM receipt_uploads r
    JOIN files f ON f.id = r.file_id
    LEFT JOIN users u ON u.id = r.uploaded_by
    WHERE r.id = ${id} AND r.deleted_at IS NULL
  `);
  return row ?? null;
}

/** The next unreviewed receipt, so the reviewer can work straight through a batch. */
export async function getNextInQueue(
  currentId: string,
  batchId: string | null,
): Promise<{ id: string; remaining: number } | null> {
  const [row] = await rows<{ id: string; remaining: number }>(sql`
    WITH queue AS (
      SELECT id FROM receipt_uploads
      WHERE deleted_at IS NULL AND status = 'needs_review' AND id <> ${currentId}
        ${batchId ? sql`AND batch_id = ${batchId}` : sql``}
      ORDER BY overall_confidence ASC NULLS FIRST, created_at ASC
    )
    SELECT (SELECT id FROM queue LIMIT 1) AS id, (SELECT COUNT(*) FROM queue)::int AS remaining
  `);
  return row?.id ? row : null;
}

export type ExtractionAccuracy = {
  reviewed: number;
  untouched: number;
  correctedSupplier: number;
  correctedDate: number;
  correctedTotal: number;
  correctedJob: number;
  correctedCategory: number;
  avgConfidence: number;
};

/**
 * How often the extractor gets it right, measured against what humans
 * actually changed on review. Shown in Settings so the owner can see whether
 * it's worth trusting.
 */
export async function getExtractionAccuracy(): Promise<ExtractionAccuracy> {
  const [row] = await rows<ExtractionAccuracy>(sql`
    SELECT
      COUNT(*)::int AS reviewed,
      COUNT(*) FILTER (WHERE corrected_fields IS NULL
                          OR jsonb_array_length(COALESCE(corrected_fields, '[]'::jsonb)) = 0)::int AS untouched,
      COUNT(*) FILTER (WHERE corrected_fields @> '["supplier"]'::jsonb)::int AS "correctedSupplier",
      COUNT(*) FILTER (WHERE corrected_fields @> '["date"]'::jsonb)::int AS "correctedDate",
      COUNT(*) FILTER (WHERE corrected_fields @> '["total"]'::jsonb)::int AS "correctedTotal",
      COUNT(*) FILTER (WHERE corrected_fields @> '["job"]'::jsonb)::int AS "correctedJob",
      COUNT(*) FILTER (WHERE corrected_fields @> '["category"]'::jsonb)::int AS "correctedCategory",
      COALESCE(ROUND(AVG(overall_confidence)), 0)::int AS "avgConfidence"
    FROM receipt_uploads
    WHERE deleted_at IS NULL AND status = 'approved'
  `);
  return (
    row ?? {
      reviewed: 0, untouched: 0, correctedSupplier: 0, correctedDate: 0,
      correctedTotal: 0, correctedJob: 0, correctedCategory: 0, avgConfidence: 0,
    }
  );
}

export type QueueCounts = { needsReview: number; processing: number; failed: number; approvedToday: number };

export async function getQueueCounts(): Promise<QueueCounts> {
  const [row] = await rows<QueueCounts>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'needs_review')::int AS "needsReview",
      COUNT(*) FILTER (WHERE status IN ('uploaded','processing'))::int AS processing,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'approved' AND reviewed_at::date = CURRENT_DATE)::int AS "approvedToday"
    FROM receipt_uploads WHERE deleted_at IS NULL
  `);
  return row ?? { needsReview: 0, processing: 0, failed: 0, approvedToday: 0 };
}
