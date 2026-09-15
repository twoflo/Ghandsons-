import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  clientId: string;
  clientName: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  daysOverdue: number;
};

export type InvoiceFilter = "all" | "unpaid" | "overdue" | "draft" | "paid";

export async function listInvoices(
  filters: { filter?: InvoiceFilter; clientId?: string; jobId?: string; search?: string } = {},
): Promise<InvoiceListItem[]> {
  const q = filters.search?.trim();
  const filter = filters.filter ?? "all";

  return rows<InvoiceListItem>(sql`
    SELECT
      i.id, i.invoice_number AS "invoiceNumber", i.type::text AS type, i.status::text AS status,
      i.client_id AS "clientId", c.name AS "clientName",
      i.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
      i.issue_date::text AS "issueDate", i.due_date::text AS "dueDate",
      i.total_cents AS "totalCents", i.amount_paid_cents AS "amountPaidCents",
      i.balance_cents AS "balanceCents",
      GREATEST(0, CURRENT_DATE - i.due_date)::int AS "daysOverdue"
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN jobs j ON j.id = i.job_id
    WHERE i.deleted_at IS NULL
      ${filter === "unpaid" ? sql`AND i.status IN ('sent','part_paid','overdue') AND i.balance_cents > 0` : sql``}
      ${filter === "overdue" ? sql`AND i.status IN ('sent','part_paid','overdue') AND i.balance_cents > 0 AND i.due_date < CURRENT_DATE` : sql``}
      ${filter === "draft" ? sql`AND i.status = 'draft'` : sql``}
      ${filter === "paid" ? sql`AND i.status = 'paid'` : sql``}
      ${filters.clientId ? sql`AND i.client_id = ${filters.clientId}` : sql``}
      ${filters.jobId ? sql`AND i.job_id = ${filters.jobId}` : sql``}
      ${q ? sql`AND (i.invoice_number ILIKE ${"%" + q + "%"} OR c.name ILIKE ${"%" + q + "%"}
                     OR j.title ILIKE ${"%" + q + "%"} OR i.reference ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY
      CASE WHEN i.status = 'draft' THEN 0 ELSE 1 END,
      i.due_date ASC NULLS LAST,
      i.invoice_number DESC
    LIMIT 250
  `);
}

export type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientAbn: string | null;
  clientAddress: string | null;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  siteAddress: string | null;
  issueDate: string | null;
  dueDate: string | null;
  paymentTermsDays: number;
  progressPercentBp: number | null;
  previouslyClaimedCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  daysOverdue: number;
  createdByName: string | null;
};

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const [row] = await rows<InvoiceDetail>(sql`
    SELECT
      i.id, i.invoice_number AS "invoiceNumber", i.type::text AS type, i.status::text AS status,
      i.client_id AS "clientId", c.name AS "clientName", c.email AS "clientEmail", c.abn AS "clientAbn",
      NULLIF(CONCAT_WS(' ', c.address_line1, c.suburb, c.state, c.postcode), '') AS "clientAddress",
      i.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
      NULLIF(CONCAT_WS(' ', s.address_line1, s.suburb, s.state, s.postcode), '') AS "siteAddress",
      i.issue_date::text AS "issueDate", i.due_date::text AS "dueDate",
      i.payment_terms_days AS "paymentTermsDays",
      i.progress_percent_bp AS "progressPercentBp",
      i.previously_claimed_cents AS "previouslyClaimedCents",
      i.subtotal_cents AS "subtotalCents", i.tax_cents AS "taxCents", i.total_cents AS "totalCents",
      i.amount_paid_cents AS "amountPaidCents", i.balance_cents AS "balanceCents",
      i.reference, i.notes, i.terms,
      i.sent_at::text AS "sentAt", i.paid_at::text AS "paidAt",
      i.voided_at::text AS "voidedAt", i.void_reason AS "voidReason",
      GREATEST(0, CURRENT_DATE - i.due_date)::int AS "daysOverdue",
      u.full_name AS "createdByName"
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN jobs j ON j.id = i.job_id
    LEFT JOIN sites s ON s.id = COALESCE(i.site_id, j.site_id)
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ${id} AND i.deleted_at IS NULL
  `);
  return row ?? null;
}

export type InvoiceLineRow = {
  id: string;
  sortOrder: number;
  isHeading: number;
  sourceType: string;
  sourceId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPriceCents: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
  taxRateId: string | null;
  taxRateBp: number;
};

export async function getInvoiceLines(invoiceId: string): Promise<InvoiceLineRow[]> {
  return rows<InvoiceLineRow>(sql`
    SELECT il.id, il.sort_order AS "sortOrder", il.is_heading AS "isHeading",
           il.source_type AS "sourceType", il.source_id AS "sourceId",
           il.description, il.quantity::text AS quantity, il.unit,
           il.unit_price_cents AS "unitPriceCents",
           il.line_subtotal_cents AS "lineSubtotalCents",
           il.line_tax_cents AS "lineTaxCents", il.line_total_cents AS "lineTotalCents",
           il.tax_rate_id AS "taxRateId", COALESCE(tr.rate_bp, 0) AS "taxRateBp"
    FROM invoice_lines il
    LEFT JOIN tax_rates tr ON tr.id = il.tax_rate_id
    WHERE il.invoice_id = ${invoiceId} AND il.deleted_at IS NULL
    ORDER BY il.sort_order, il.created_at
  `);
}

export type PaymentRow = {
  id: string; amountCents: number; paidOn: string; method: string;
  reference: string | null; notes: string | null; recordedByName: string | null;
};

export async function getPayments(invoiceId: string): Promise<PaymentRow[]> {
  return rows<PaymentRow>(sql`
    SELECT p.id, p.amount_cents AS "amountCents", p.paid_on::text AS "paidOn",
           p.method::text AS method, p.reference, p.notes, u.full_name AS "recordedByName"
    FROM payments p LEFT JOIN users u ON u.id = p.recorded_by
    WHERE p.invoice_id = ${invoiceId} AND p.deleted_at IS NULL
    ORDER BY p.paid_on DESC, p.created_at DESC
  `);
}

/* --------- things that can be pulled onto an invoice from a job --------- */

export type BillableExpense = {
  id: string; expenseDate: string; description: string; supplierName: string | null;
  categoryName: string | null; subtotalCents: number;
};

export async function getBillableExpenses(jobId: string): Promise<BillableExpense[]> {
  return rows<BillableExpense>(sql`
    SELECT e.id, e.expense_date::text AS "expenseDate", e.description,
           s.name AS "supplierName", ec.name AS "categoryName",
           e.subtotal_cents AS "subtotalCents"
    FROM expenses e
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.job_id = ${jobId} AND e.deleted_at IS NULL
      AND e.is_billable AND e.billed_invoice_line_id IS NULL
    ORDER BY e.expense_date
  `);
}

export type BillableVariation = {
  id: string; variationNumber: string; title: string; subtotalCents: number;
  approvedAt: string | null;
};

export async function getBillableVariations(jobId: string): Promise<BillableVariation[]> {
  return rows<BillableVariation>(sql`
    SELECT v.id, v.variation_number AS "variationNumber", v.title,
           v.subtotal_cents AS "subtotalCents", v.approved_at::text AS "approvedAt"
    FROM variations v
    WHERE v.job_id = ${jobId} AND v.deleted_at IS NULL
      AND v.status = 'approved' AND v.invoice_id IS NULL
    ORDER BY v.variation_number
  `);
}

export type JobClaimContext = {
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  clientId: string;
  clientName: string;
  clientTermsDays: number | null;
  contractValueCents: number;
  approvedVariationsCents: number;
  revisedContractCents: number;
  alreadyClaimedCents: number;
};

/** What a progress claim needs to know: contract, variations and what's been claimed. */
export async function getJobClaimContext(jobId: string): Promise<JobClaimContext | null> {
  const [row] = await rows<JobClaimContext>(sql`
    SELECT
      j.id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
      j.client_id AS "clientId", c.name AS "clientName",
      c.payment_terms_days AS "clientTermsDays",
      f.contract_value_cents::int AS "contractValueCents",
      f.approved_variations_cents::int AS "approvedVariationsCents",
      f.revised_contract_cents::int AS "revisedContractCents",
      f.invoiced_ex_tax_cents::int AS "alreadyClaimedCents"
    FROM jobs j
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN job_financials f ON f.job_id = j.id
    WHERE j.id = ${jobId} AND j.deleted_at IS NULL
  `);
  return row ?? null;
}

export type ReceivablesSummary = {
  currentCents: number; b1Cents: number; b2Cents: number; b3Cents: number; b4Cents: number;
  totalCents: number; count: number;
};

export async function getReceivablesSummary(): Promise<ReceivablesSummary> {
  const [row] = await rows<ReceivablesSummary>(sql`
    SELECT
      COALESCE(SUM(balance_cents) FILTER (WHERE bucket = 'current'), 0)::int AS "currentCents",
      COALESCE(SUM(balance_cents) FILTER (WHERE bucket = '1_30'), 0)::int    AS "b1Cents",
      COALESCE(SUM(balance_cents) FILTER (WHERE bucket = '31_60'), 0)::int   AS "b2Cents",
      COALESCE(SUM(balance_cents) FILTER (WHERE bucket = '61_90'), 0)::int   AS "b3Cents",
      COALESCE(SUM(balance_cents) FILTER (WHERE bucket = '90_plus'), 0)::int AS "b4Cents",
      COALESCE(SUM(balance_cents), 0)::int AS "totalCents",
      COUNT(*)::int AS count
    FROM aged_receivables
  `);
  return row ?? { currentCents: 0, b1Cents: 0, b2Cents: 0, b3Cents: 0, b4Cents: 0, totalCents: 0, count: 0 };
}
