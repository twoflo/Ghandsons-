import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type QuoteListItem = {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  jobId: string | null;
  jobNumber: string | null;
  issueDate: string | null;
  validUntil: string | null;
  subtotalCents: number;
  totalCents: number;
  costTotalCents: number;
  marginBp: number;
  daysToExpiry: number | null;
  lineCount: number;
};

export async function listQuotes(filters: { status?: string; clientId?: string; jobId?: string; search?: string } = {}) {
  const q = filters.search?.trim();
  return rows<QuoteListItem>(sql`
    SELECT
      q.id, q.quote_number AS "quoteNumber", q.title, q.status::text AS status,
      q.client_id AS "clientId", c.name AS "clientName",
      q.job_id AS "jobId", j.job_number AS "jobNumber",
      q.issue_date::text AS "issueDate", q.valid_until::text AS "validUntil",
      q.subtotal_cents AS "subtotalCents", q.total_cents AS "totalCents",
      q.cost_total_cents AS "costTotalCents",
      CASE WHEN q.subtotal_cents > 0
           THEN ROUND(((q.subtotal_cents - q.cost_total_cents)::numeric / q.subtotal_cents) * 10000)::int
           ELSE 0 END AS "marginBp",
      CASE WHEN q.valid_until IS NULL THEN NULL
           ELSE (q.valid_until - CURRENT_DATE)::int END AS "daysToExpiry",
      (SELECT COUNT(*) FROM quote_lines ql WHERE ql.quote_id = q.id AND ql.deleted_at IS NULL)::int AS "lineCount"
    FROM quotes q
    JOIN clients c ON c.id = q.client_id
    LEFT JOIN jobs j ON j.id = q.job_id
    WHERE q.deleted_at IS NULL
      ${filters.status ? sql`AND q.status::text = ${filters.status}` : sql``}
      ${filters.clientId ? sql`AND q.client_id = ${filters.clientId}` : sql``}
      ${filters.jobId ? sql`AND q.job_id = ${filters.jobId}` : sql``}
      ${q ? sql`AND (q.title ILIKE ${"%" + q + "%"} OR q.quote_number ILIKE ${"%" + q + "%"}
                     OR c.name ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY q.issue_date DESC NULLS FIRST, q.quote_number DESC
    LIMIT 200
  `);
}

export type QuoteDetail = {
  id: string;
  quoteNumber: string;
  revision: number;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientAbn: string | null;
  clientAddress: string | null;
  siteId: string | null;
  siteLabel: string | null;
  siteAddress: string | null;
  jobId: string | null;
  jobNumber: string | null;
  issueDate: string | null;
  validUntil: string | null;
  globalMarkupBp: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  costTotalCents: number;
  scopeOfWork: string | null;
  exclusions: string | null;
  terms: string | null;
  internalNotes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  createdByName: string | null;
};

export async function getQuote(id: string): Promise<QuoteDetail | null> {
  const [row] = await rows<QuoteDetail>(sql`
    SELECT
      q.id, q.quote_number AS "quoteNumber", q.revision, q.title, q.status::text AS status,
      q.client_id AS "clientId", c.name AS "clientName", c.email AS "clientEmail", c.abn AS "clientAbn",
      NULLIF(CONCAT_WS(' ', c.address_line1, c.suburb, c.state, c.postcode), '') AS "clientAddress",
      q.site_id AS "siteId", s.label AS "siteLabel",
      NULLIF(CONCAT_WS(' ', s.address_line1, s.suburb, s.state, s.postcode), '') AS "siteAddress",
      q.job_id AS "jobId", j.job_number AS "jobNumber",
      q.issue_date::text AS "issueDate", q.valid_until::text AS "validUntil",
      q.global_markup_bp AS "globalMarkupBp",
      q.subtotal_cents AS "subtotalCents", q.tax_cents AS "taxCents",
      q.total_cents AS "totalCents", q.cost_total_cents AS "costTotalCents",
      q.scope_of_work AS "scopeOfWork", q.exclusions, q.terms,
      q.internal_notes AS "internalNotes",
      q.sent_at::text AS "sentAt", q.accepted_at::text AS "acceptedAt",
      q.accepted_by_name AS "acceptedByName",
      q.rejected_at::text AS "rejectedAt", q.rejected_reason AS "rejectedReason",
      u.full_name AS "createdByName"
    FROM quotes q
    JOIN clients c ON c.id = q.client_id
    LEFT JOIN sites s ON s.id = q.site_id
    LEFT JOIN jobs j ON j.id = q.job_id
    LEFT JOIN users u ON u.id = q.created_by
    WHERE q.id = ${id} AND q.deleted_at IS NULL
  `);
  return row ?? null;
}

export type QuoteLineRow = {
  id: string;
  sortOrder: number;
  isHeading: number;
  kind: string;
  description: string;
  quantity: string;
  unit: string;
  unitCostCents: number;
  markupBp: number | null;
  unitPriceCents: number;
  lineCostCents: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
  taxRateId: string | null;
  taxRateBp: number;
  priceBookItemId: string | null;
  notes: string | null;
};

export async function getQuoteLines(quoteId: string): Promise<QuoteLineRow[]> {
  return rows<QuoteLineRow>(sql`
    SELECT ql.id, ql.sort_order AS "sortOrder", ql.is_heading AS "isHeading",
           ql.kind::text AS kind, ql.description, ql.quantity::text AS quantity, ql.unit,
           ql.unit_cost_cents AS "unitCostCents", ql.markup_bp AS "markupBp",
           ql.unit_price_cents AS "unitPriceCents", ql.line_cost_cents AS "lineCostCents",
           ql.line_subtotal_cents AS "lineSubtotalCents", ql.line_tax_cents AS "lineTaxCents",
           ql.line_total_cents AS "lineTotalCents",
           ql.tax_rate_id AS "taxRateId", COALESCE(tr.rate_bp, 0) AS "taxRateBp",
           ql.price_book_item_id AS "priceBookItemId", ql.notes
    FROM quote_lines ql
    LEFT JOIN tax_rates tr ON tr.id = ql.tax_rate_id
    WHERE ql.quote_id = ${quoteId} AND ql.deleted_at IS NULL
    ORDER BY ql.sort_order, ql.created_at
  `);
}

export type PriceBookEntry = {
  id: string; code: string; name: string; description: string | null; kind: string;
  unit: string; unitCostCents: number; defaultMarkupBp: number; taxRateId: string | null;
};

export async function getPriceBook(): Promise<PriceBookEntry[]> {
  return rows<PriceBookEntry>(sql`
    SELECT id, code, name, description, kind::text AS kind, unit,
           unit_cost_cents AS "unitCostCents", default_markup_bp AS "defaultMarkupBp",
           tax_rate_id AS "taxRateId"
    FROM price_book_items
    WHERE is_active AND deleted_at IS NULL
    ORDER BY kind, name
  `);
}

export type QuoteStats = {
  sentCount: number; sentValueCents: number;
  acceptedCount: number; acceptedValueCents: number;
  winRateBp: number; expiringSoon: number;
};

export async function getQuoteStats(): Promise<QuoteStats> {
  const [row] = await rows<QuoteStats>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent')::int AS "sentCount",
      COALESCE(SUM(subtotal_cents) FILTER (WHERE status = 'sent'), 0)::int AS "sentValueCents",
      COUNT(*) FILTER (WHERE status = 'accepted')::int AS "acceptedCount",
      COALESCE(SUM(subtotal_cents) FILTER (WHERE status = 'accepted'), 0)::int AS "acceptedValueCents",
      CASE WHEN COUNT(*) FILTER (WHERE status IN ('accepted','rejected','expired')) > 0
        THEN ROUND(
          COUNT(*) FILTER (WHERE status = 'accepted')::numeric * 10000
          / COUNT(*) FILTER (WHERE status IN ('accepted','rejected','expired'))
        )::int
        ELSE 0 END AS "winRateBp",
      COUNT(*) FILTER (WHERE status = 'sent' AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS "expiringSoon"
    FROM quotes WHERE deleted_at IS NULL
  `);
  return row ?? { sentCount: 0, sentValueCents: 0, acceptedCount: 0, acceptedValueCents: 0, winRateBp: 0, expiringSoon: 0 };
}
