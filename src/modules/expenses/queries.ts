import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type ExpenseListItem = {
  id: string;
  expenseDate: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: string | null;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  isBillable: boolean;
  billed: boolean;
  source: string;
  receiptFileId: string | null;
  supplierNameRaw: string | null;
  createdByName: string | null;
};

export type ExpenseFilter = "all" | "unbilled" | "no_job" | "no_receipt";

export async function listExpenses(
  filters: {
    filter?: ExpenseFilter; jobId?: string; supplierId?: string; categoryId?: string;
    search?: string; from?: string; to?: string; limit?: number;
  } = {},
): Promise<ExpenseListItem[]> {
  const q = filters.search?.trim();
  const filter = filters.filter ?? "all";

  return rows<ExpenseListItem>(sql`
    SELECT
      e.id, e.expense_date::text AS "expenseDate", e.description,
      e.supplier_id AS "supplierId", s.name AS "supplierName",
      e.category_id AS "categoryId", ec.name AS "categoryName", ec.kind::text AS "categoryKind",
      e.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
      e.subtotal_cents AS "subtotalCents", e.tax_cents AS "taxCents", e.total_cents AS "totalCents",
      e.is_billable AS "isBillable",
      (e.billed_invoice_line_id IS NOT NULL) AS billed,
      e.source::text AS source, e.receipt_file_id AS "receiptFileId",
      e.supplier_name_raw AS "supplierNameRaw",
      u.full_name AS "createdByName"
    FROM expenses e
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    LEFT JOIN jobs j ON j.id = e.job_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.deleted_at IS NULL
      ${filter === "unbilled" ? sql`AND e.is_billable AND e.billed_invoice_line_id IS NULL AND e.job_id IS NOT NULL` : sql``}
      ${filter === "no_job" ? sql`AND e.job_id IS NULL` : sql``}
      ${filter === "no_receipt" ? sql`AND e.receipt_file_id IS NULL` : sql``}
      ${filters.jobId ? sql`AND e.job_id = ${filters.jobId}` : sql``}
      ${filters.supplierId ? sql`AND e.supplier_id = ${filters.supplierId}` : sql``}
      ${filters.categoryId ? sql`AND e.category_id = ${filters.categoryId}` : sql``}
      ${filters.from ? sql`AND e.expense_date >= ${filters.from}::date` : sql``}
      ${filters.to ? sql`AND e.expense_date <= ${filters.to}::date` : sql``}
      ${q ? sql`AND (e.description ILIKE ${"%" + q + "%"} OR s.name ILIKE ${"%" + q + "%"}
                     OR e.supplier_name_raw ILIKE ${"%" + q + "%"} OR j.title ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY e.expense_date DESC, e.created_at DESC
    LIMIT ${filters.limit ?? 300}
  `);
}

export type ExpenseDetail = ExpenseListItem & {
  notes: string | null;
  reference: string | null;
  paymentMethod: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  receiptUploadId: string | null;
  billedInvoiceId: string | null;
  billedInvoiceNumber: string | null;
  createdAt: string;
};

export async function getExpense(id: string): Promise<ExpenseDetail | null> {
  const [row] = await rows<ExpenseDetail>(sql`
    SELECT
      e.id, e.expense_date::text AS "expenseDate", e.description,
      e.supplier_id AS "supplierId", s.name AS "supplierName",
      e.category_id AS "categoryId", ec.name AS "categoryName", ec.kind::text AS "categoryKind",
      e.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
      e.subtotal_cents AS "subtotalCents", e.tax_cents AS "taxCents", e.total_cents AS "totalCents",
      e.is_billable AS "isBillable",
      (e.billed_invoice_line_id IS NOT NULL) AS billed,
      e.source::text AS source, e.receipt_file_id AS "receiptFileId",
      u.full_name AS "createdByName",
      e.notes, e.reference, e.payment_method::text AS "paymentMethod",
      e.supplier_name_raw AS "supplierNameRaw",
      e.purchase_order_id AS "purchaseOrderId", po.po_number AS "poNumber",
      e.receipt_upload_id AS "receiptUploadId",
      il.invoice_id AS "billedInvoiceId", inv.invoice_number AS "billedInvoiceNumber",
      e.created_at::text AS "createdAt"
    FROM expenses e
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    LEFT JOIN jobs j ON j.id = e.job_id
    LEFT JOIN users u ON u.id = e.created_by
    LEFT JOIN purchase_orders po ON po.id = e.purchase_order_id
    LEFT JOIN invoice_lines il ON il.id = e.billed_invoice_line_id
    LEFT JOIN invoices inv ON inv.id = il.invoice_id
    WHERE e.id = ${id} AND e.deleted_at IS NULL
  `);
  return row ?? null;
}

export type ExpenseLineRow = {
  id: string; description: string; quantity: string; unit: string;
  unitPriceCents: number; lineTotalCents: number; extractionConfidence: number | null;
};

export async function getExpenseLines(expenseId: string): Promise<ExpenseLineRow[]> {
  return rows<ExpenseLineRow>(sql`
    SELECT id, description, quantity::text AS quantity, unit,
           unit_price_cents AS "unitPriceCents", line_total_cents AS "lineTotalCents",
           extraction_confidence AS "extractionConfidence"
    FROM expense_lines WHERE expense_id = ${expenseId} AND deleted_at IS NULL
    ORDER BY sort_order
  `);
}

export type ExpenseTotals = {
  totalCents: number; taxCents: number; count: number;
  unbilledCents: number; noJobCents: number; noReceiptCount: number;
};

export async function getExpenseTotals(
  filters: { from?: string; to?: string } = {},
): Promise<ExpenseTotals> {
  const [row] = await rows<ExpenseTotals>(sql`
    SELECT
      COALESCE(SUM(e.total_cents), 0)::int AS "totalCents",
      COALESCE(SUM(e.tax_cents), 0)::int AS "taxCents",
      COUNT(*)::int AS count,
      COALESCE(SUM(e.subtotal_cents) FILTER (
        WHERE e.is_billable AND e.billed_invoice_line_id IS NULL AND e.job_id IS NOT NULL
      ), 0)::int AS "unbilledCents",
      COALESCE(SUM(e.total_cents) FILTER (WHERE e.job_id IS NULL), 0)::int AS "noJobCents",
      COUNT(*) FILTER (WHERE e.receipt_file_id IS NULL)::int AS "noReceiptCount"
    FROM expenses e
    WHERE e.deleted_at IS NULL
      ${filters.from ? sql`AND e.expense_date >= ${filters.from}::date` : sql``}
      ${filters.to ? sql`AND e.expense_date <= ${filters.to}::date` : sql``}
  `);
  return row ?? { totalCents: 0, taxCents: 0, count: 0, unbilledCents: 0, noJobCents: 0, noReceiptCount: 0 };
}

export type SupplierOption = { id: string; name: string; defaultCategoryId: string | null };
export type CategoryOption = { id: string; name: string; kind: string; defaultBillable: boolean };

export async function getExpenseFormOptions() {
  const [suppliers, categories, jobs] = await Promise.all([
    rows<SupplierOption>(sql`
      SELECT id, name, default_category_id AS "defaultCategoryId"
      FROM suppliers WHERE deleted_at IS NULL ORDER BY name
    `),
    rows<CategoryOption>(sql`
      SELECT id, name, kind::text AS kind, default_billable AS "defaultBillable"
      FROM expense_categories WHERE is_active AND deleted_at IS NULL ORDER BY sort_order, name
    `),
    rows<{ id: string; jobNumber: string; title: string; clientName: string }>(sql`
      SELECT j.id, j.job_number AS "jobNumber", j.title, c.name AS "clientName"
      FROM jobs j JOIN clients c ON c.id = j.client_id
      WHERE j.deleted_at IS NULL AND j.status NOT IN ('lost','cancelled')
      ORDER BY
        CASE WHEN j.status IN ('in_progress','scheduled') THEN 0 ELSE 1 END,
        j.job_number DESC
    `),
  ]);
  return { suppliers, categories, jobs };
}
