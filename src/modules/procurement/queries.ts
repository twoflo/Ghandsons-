import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

/* -------------------------------- suppliers ------------------------------- */

export type SupplierListItem = {
  id: string;
  name: string;
  abn: string | null;
  phone: string | null;
  email: string | null;
  suburb: string | null;
  accountNumber: string | null;
  paymentTermsDays: number;
  contactName: string | null;
  defaultCategoryName: string | null;
  spendYtdCents: number;
  spendAllTimeCents: number;
  expenseCount: number;
  openPoCount: number;
  lastUsed: string | null;
};

export async function listSuppliers(search?: string): Promise<SupplierListItem[]> {
  const q = search?.trim();
  return rows<SupplierListItem>(sql`
    SELECT s.id, s.name, s.abn, s.phone, s.email, s.suburb,
           s.account_number AS "accountNumber",
           s.payment_terms_days AS "paymentTermsDays",
           s.contact_name AS "contactName",
           ec.name AS "defaultCategoryName",
           COALESCE((
             SELECT SUM(e.total_cents) FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL
               AND e.expense_date >= date_trunc('year', CURRENT_DATE - interval '6 months') + interval '6 months'
           ), 0)::int AS "spendYtdCents",
           COALESCE((
             SELECT SUM(e.total_cents) FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL
           ), 0)::int AS "spendAllTimeCents",
           COALESCE((
             SELECT COUNT(*) FROM expenses e WHERE e.supplier_id = s.id AND e.deleted_at IS NULL
           ), 0)::int AS "expenseCount",
           COALESCE((
             SELECT COUNT(*) FROM purchase_orders po
             WHERE po.supplier_id = s.id AND po.deleted_at IS NULL
               AND po.status IN ('sent','part_received','received')
           ), 0)::int AS "openPoCount",
           (SELECT MAX(e.expense_date)::text FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL) AS "lastUsed"
    FROM suppliers s
    LEFT JOIN expense_categories ec ON ec.id = s.default_category_id
    WHERE s.deleted_at IS NULL
      ${q ? sql`AND (s.name ILIKE ${"%" + q + "%"} OR s.abn ILIKE ${"%" + q + "%"}
                     OR s.contact_name ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY "spendAllTimeCents" DESC, s.name
  `);
}

export type SupplierDetail = SupplierListItem & {
  website: string | null;
  addressLine1: string | null;
  state: string | null;
  postcode: string | null;
  notes: string | null;
  defaultCategoryId: string | null;
  aliases: string[];
};

export async function getSupplier(id: string): Promise<SupplierDetail | null> {
  const [row] = await rows<SupplierDetail>(sql`
    SELECT s.id, s.name, s.abn, s.phone, s.email, s.suburb, s.website,
           s.address_line1 AS "addressLine1", s.state, s.postcode,
           s.account_number AS "accountNumber",
           s.payment_terms_days AS "paymentTermsDays",
           s.contact_name AS "contactName", s.notes,
           s.default_category_id AS "defaultCategoryId",
           ec.name AS "defaultCategoryName",
           COALESCE((SELECT SUM(e.total_cents) FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL), 0)::int AS "spendAllTimeCents",
           COALESCE((SELECT SUM(e.total_cents) FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL
               AND e.expense_date >= CURRENT_DATE - 365), 0)::int AS "spendYtdCents",
           COALESCE((SELECT COUNT(*) FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL), 0)::int AS "expenseCount",
           COALESCE((SELECT COUNT(*) FROM purchase_orders po
             WHERE po.supplier_id = s.id AND po.deleted_at IS NULL
               AND po.status IN ('sent','part_received','received')), 0)::int AS "openPoCount",
           (SELECT MAX(e.expense_date)::text FROM expenses e
             WHERE e.supplier_id = s.id AND e.deleted_at IS NULL) AS "lastUsed",
           COALESCE(ARRAY(
             SELECT a.alias FROM supplier_aliases a WHERE a.supplier_id = s.id ORDER BY a.alias
           ), '{}') AS aliases
    FROM suppliers s
    LEFT JOIN expense_categories ec ON ec.id = s.default_category_id
    WHERE s.id = ${id} AND s.deleted_at IS NULL
  `);
  return row ?? null;
}

/* ----------------------------- purchase orders ---------------------------- */

export type PoListItem = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  status: string;
  orderDate: string | null;
  expectedDate: string | null;
  subtotalCents: number;
  totalCents: number;
  lineCount: number;
  receivedPct: number;
  daysLate: number;
};

export async function listPurchaseOrders(
  filters: { status?: string; jobId?: string; supplierId?: string; search?: string } = {},
): Promise<PoListItem[]> {
  const q = filters.search?.trim();
  return rows<PoListItem>(sql`
    SELECT po.id, po.po_number AS "poNumber",
           po.supplier_id AS "supplierId", s.name AS "supplierName",
           po.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           po.status::text AS status,
           po.order_date::text AS "orderDate", po.expected_date::text AS "expectedDate",
           po.subtotal_cents AS "subtotalCents", po.total_cents AS "totalCents",
           (SELECT COUNT(*) FROM purchase_order_lines l
             WHERE l.purchase_order_id = po.id AND l.deleted_at IS NULL)::int AS "lineCount",
           COALESCE((
             SELECT ROUND(100.0 * SUM(LEAST(l.quantity_received, l.quantity)) / NULLIF(SUM(l.quantity), 0))
             FROM purchase_order_lines l
             WHERE l.purchase_order_id = po.id AND l.deleted_at IS NULL
           ), 0)::int AS "receivedPct",
           GREATEST(0, CURRENT_DATE - po.expected_date)::int AS "daysLate"
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN jobs j ON j.id = po.job_id
    WHERE po.deleted_at IS NULL
      ${filters.status ? sql`AND po.status::text = ${filters.status}` : sql``}
      ${filters.jobId ? sql`AND po.job_id = ${filters.jobId}` : sql``}
      ${filters.supplierId ? sql`AND po.supplier_id = ${filters.supplierId}` : sql``}
      ${q ? sql`AND (po.po_number ILIKE ${"%" + q + "%"} OR s.name ILIKE ${"%" + q + "%"}
                     OR j.title ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY
      CASE po.status WHEN 'draft' THEN 0 WHEN 'sent' THEN 1 WHEN 'part_received' THEN 2 ELSE 3 END,
      po.expected_date NULLS LAST, po.po_number DESC
    LIMIT 200
  `);
}

export type PoDetail = PoListItem & {
  supplierEmail: string | null;
  supplierPhone: string | null;
  supplierTerms: number;
  deliverTo: string | null;
  notes: string | null;
  taxCents: number;
  sentAt: string | null;
  createdByName: string | null;
};

export async function getPurchaseOrder(id: string): Promise<PoDetail | null> {
  const [row] = await rows<PoDetail>(sql`
    SELECT po.id, po.po_number AS "poNumber",
           po.supplier_id AS "supplierId", s.name AS "supplierName",
           s.email AS "supplierEmail", s.phone AS "supplierPhone",
           s.payment_terms_days AS "supplierTerms",
           po.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           po.status::text AS status,
           po.order_date::text AS "orderDate", po.expected_date::text AS "expectedDate",
           po.deliver_to AS "deliverTo", po.notes,
           po.subtotal_cents AS "subtotalCents", po.tax_cents AS "taxCents",
           po.total_cents AS "totalCents",
           po.sent_at::text AS "sentAt",
           u.full_name AS "createdByName",
           (SELECT COUNT(*) FROM purchase_order_lines l
             WHERE l.purchase_order_id = po.id AND l.deleted_at IS NULL)::int AS "lineCount",
           COALESCE((
             SELECT ROUND(100.0 * SUM(LEAST(l.quantity_received, l.quantity)) / NULLIF(SUM(l.quantity), 0))
             FROM purchase_order_lines l
             WHERE l.purchase_order_id = po.id AND l.deleted_at IS NULL
           ), 0)::int AS "receivedPct",
           GREATEST(0, CURRENT_DATE - po.expected_date)::int AS "daysLate"
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN jobs j ON j.id = po.job_id
    LEFT JOIN users u ON u.id = po.created_by
    WHERE po.id = ${id} AND po.deleted_at IS NULL
  `);
  return row ?? null;
}

export type PoLineRow = {
  id: string;
  sortOrder: number;
  description: string;
  quantity: string;
  quantityReceived: string;
  unit: string;
  unitCostCents: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
  taxRateId: string | null;
};

export async function getPoLines(poId: string): Promise<PoLineRow[]> {
  return rows<PoLineRow>(sql`
    SELECT id, sort_order AS "sortOrder", description,
           quantity::text AS quantity, quantity_received::text AS "quantityReceived",
           unit, unit_cost_cents AS "unitCostCents",
           line_subtotal_cents AS "lineSubtotalCents", line_tax_cents AS "lineTaxCents",
           line_total_cents AS "lineTotalCents", tax_rate_id AS "taxRateId"
    FROM purchase_order_lines
    WHERE purchase_order_id = ${poId} AND deleted_at IS NULL
    ORDER BY sort_order
  `);
}

export type PoReceiptRow = {
  id: string;
  receivedOn: string;
  docketNumber: string | null;
  fileId: string | null;
  notes: string | null;
  receivedByName: string | null;
  lines: Array<{ purchaseOrderLineId: string; quantity: string; description: string }>;
};

export async function getPoReceipts(poId: string): Promise<PoReceiptRow[]> {
  return rows<PoReceiptRow>(sql`
    SELECT r.id, r.received_on::text AS "receivedOn", r.docket_number AS "docketNumber",
           r.file_id AS "fileId", r.notes, u.full_name AS "receivedByName",
           COALESCE((
             SELECT json_agg(json_build_object(
               'purchaseOrderLineId', rl.purchase_order_line_id,
               'quantity', rl.quantity::text,
               'description', l.description))
             FROM purchase_order_receipt_lines rl
             JOIN purchase_order_lines l ON l.id = rl.purchase_order_line_id
             WHERE rl.receipt_id = r.id
           ), '[]'::json) AS lines
    FROM purchase_order_receipts r
    LEFT JOIN users u ON u.id = r.received_by
    WHERE r.purchase_order_id = ${poId} AND r.deleted_at IS NULL
    ORDER BY r.received_on DESC
  `);
}

export type PoMatchRow = {
  id: string;
  expenseId: string;
  description: string;
  expenseDate: string;
  totalCents: number;
  matchedAmountCents: number;
  varianceCents: number;
};

export async function getPoMatches(poId: string): Promise<PoMatchRow[]> {
  return rows<PoMatchRow>(sql`
    SELECT m.id, m.expense_id AS "expenseId", e.description,
           e.expense_date::text AS "expenseDate", e.total_cents AS "totalCents",
           m.matched_amount_cents AS "matchedAmountCents",
           m.variance_cents AS "varianceCents"
    FROM purchase_order_matches m
    JOIN expenses e ON e.id = m.expense_id
    WHERE m.purchase_order_id = ${poId} AND m.deleted_at IS NULL
    ORDER BY e.expense_date DESC
  `);
}

/** Expenses from the same supplier that aren't matched to any PO yet. */
export async function getMatchableExpenses(poId: string, supplierId: string) {
  return rows<{ id: string; description: string; expenseDate: string; totalCents: number }>(sql`
    SELECT e.id, e.description, e.expense_date::text AS "expenseDate", e.total_cents AS "totalCents"
    FROM expenses e
    WHERE e.supplier_id = ${supplierId} AND e.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM purchase_order_matches m
        WHERE m.expense_id = e.id AND m.deleted_at IS NULL
      )
      AND (e.purchase_order_id IS NULL OR e.purchase_order_id = ${poId})
    ORDER BY e.expense_date DESC
    LIMIT 30
  `);
}
