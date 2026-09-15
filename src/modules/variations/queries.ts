import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type VariationRow = {
  id: string;
  variationNumber: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  clientName: string;
  title: string;
  description: string | null;
  reason: string | null;
  status: string;
  raisedOn: string | null;
  costCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  markupBp: number;
  timeImpactDays: number;
  approvedAt: string | null;
  approvedByName: string | null;
  approvalFileId: string | null;
  rejectedReason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  ageDays: number | null;
};

export async function listVariations(
  filters: { jobId?: string; status?: string } = {},
): Promise<VariationRow[]> {
  return rows<VariationRow>(sql`
    SELECT v.id, v.variation_number AS "variationNumber",
           v.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           c.name AS "clientName",
           v.title, v.description, v.reason, v.status::text AS status,
           v.raised_on::text AS "raisedOn",
           v.cost_cents AS "costCents", v.subtotal_cents AS "subtotalCents",
           v.tax_cents AS "taxCents", v.total_cents AS "totalCents",
           v.markup_bp AS "markupBp", v.time_impact_days AS "timeImpactDays",
           v.approved_at::text AS "approvedAt", v.approved_by_name AS "approvedByName",
           v.approval_file_id AS "approvalFileId", v.rejected_reason AS "rejectedReason",
           v.invoice_id AS "invoiceId", i.invoice_number AS "invoiceNumber",
           CASE WHEN v.raised_on IS NULL THEN NULL
                ELSE (CURRENT_DATE - v.raised_on)::int END AS "ageDays"
    FROM variations v
    JOIN jobs j ON j.id = v.job_id
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN invoices i ON i.id = v.invoice_id
    WHERE v.deleted_at IS NULL
      ${filters.jobId ? sql`AND v.job_id = ${filters.jobId}` : sql``}
      ${filters.status ? sql`AND v.status::text = ${filters.status}` : sql``}
    ORDER BY v.raised_on DESC NULLS FIRST, v.variation_number DESC
  `);
}

export async function getVariation(id: string): Promise<VariationRow | null> {
  const [found] = await rows<VariationRow>(sql`
    SELECT v.id, v.variation_number AS "variationNumber",
           v.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           c.name AS "clientName",
           v.title, v.description, v.reason, v.status::text AS status,
           v.raised_on::text AS "raisedOn",
           v.cost_cents AS "costCents", v.subtotal_cents AS "subtotalCents",
           v.tax_cents AS "taxCents", v.total_cents AS "totalCents",
           v.markup_bp AS "markupBp", v.time_impact_days AS "timeImpactDays",
           v.approved_at::text AS "approvedAt", v.approved_by_name AS "approvedByName",
           v.approval_file_id AS "approvalFileId", v.rejected_reason AS "rejectedReason",
           v.invoice_id AS "invoiceId", i.invoice_number AS "invoiceNumber",
           CASE WHEN v.raised_on IS NULL THEN NULL
                ELSE (CURRENT_DATE - v.raised_on)::int END AS "ageDays"
    FROM variations v
    JOIN jobs j ON j.id = v.job_id
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN invoices i ON i.id = v.invoice_id
    WHERE v.id = ${id} AND v.deleted_at IS NULL
  `);
  return found ?? null;
}

export type VariationLineRow = {
  id: string;
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
  sortOrder: number;
};

export async function getVariationLines(variationId: string): Promise<VariationLineRow[]> {
  return rows<VariationLineRow>(sql`
    SELECT vl.id, vl.kind::text AS kind, vl.description, vl.quantity::text AS quantity, vl.unit,
           vl.unit_cost_cents AS "unitCostCents", vl.markup_bp AS "markupBp",
           vl.unit_price_cents AS "unitPriceCents", vl.line_cost_cents AS "lineCostCents",
           vl.line_subtotal_cents AS "lineSubtotalCents", vl.line_tax_cents AS "lineTaxCents",
           vl.line_total_cents AS "lineTotalCents",
           vl.tax_rate_id AS "taxRateId", COALESCE(tr.rate_bp, 0) AS "taxRateBp",
           vl.sort_order AS "sortOrder"
    FROM variation_lines vl
    LEFT JOIN tax_rates tr ON tr.id = vl.tax_rate_id
    WHERE vl.variation_id = ${variationId} AND vl.deleted_at IS NULL
    ORDER BY vl.sort_order
  `);
}
