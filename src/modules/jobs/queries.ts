import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type JobListItem = {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  siteSuburb: string | null;
  jobTypeName: string | null;
  jobTypeColour: string | null;
  startDate: string | null;
  endDate: string | null;
  isPriority: boolean;
  contractValueCents: number;
  revisedBudgetCents: number;
  actualTotalCents: number;
  budgetVarianceCents: number;
  outstandingCents: number;
  crew: string[];
};

export type JobFilters = {
  status?: string | string[];
  clientId?: string;
  search?: string;
  assignedTo?: string;
  overBudget?: boolean;
};

export async function listJobs(filters: JobFilters = {}): Promise<JobListItem[]> {
  const statuses = Array.isArray(filters.status)
    ? filters.status
    : filters.status
      ? [filters.status]
      : null;

  const search = filters.search?.trim();

  return rows<JobListItem>(sql`
    SELECT
      j.id, j.job_number AS "jobNumber", j.title, j.status::text AS status,
      j.client_id AS "clientId", c.name AS "clientName",
      s.suburb AS "siteSuburb",
      jt.name AS "jobTypeName", jt.colour AS "jobTypeColour",
      j.start_date::text AS "startDate", j.end_date::text AS "endDate",
      j.is_priority AS "isPriority",
      j.contract_value_cents AS "contractValueCents",
      COALESCE(f.revised_budget_cents, 0)::int AS "revisedBudgetCents",
      COALESCE(f.actual_total_cents, 0)::int   AS "actualTotalCents",
      COALESCE(f.budget_variance_cents, 0)::int AS "budgetVarianceCents",
      COALESCE(f.outstanding_cents, 0)::int    AS "outstandingCents",
      COALESCE(ARRAY(
        SELECT u.full_name FROM job_assignments ja
        JOIN users u ON u.id = ja.user_id
        WHERE ja.job_id = j.id AND ja.deleted_at IS NULL
        ORDER BY u.full_name
      ), '{}') AS crew
    FROM jobs j
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN sites s ON s.id = j.site_id
    LEFT JOIN job_types jt ON jt.id = j.job_type_id
    LEFT JOIN job_financials f ON f.job_id = j.id
    WHERE j.deleted_at IS NULL
      ${statuses ? sql`AND j.status::text IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})` : sql``}
      ${filters.clientId ? sql`AND j.client_id = ${filters.clientId}` : sql``}
      ${filters.overBudget ? sql`AND f.budget_variance_cents > 0` : sql``}
      ${filters.assignedTo
        ? sql`AND EXISTS (SELECT 1 FROM job_assignments ja
                          WHERE ja.job_id = j.id AND ja.user_id = ${filters.assignedTo}
                            AND ja.deleted_at IS NULL)`
        : sql``}
      ${search
        ? sql`AND (j.title ILIKE ${"%" + search + "%"}
               OR j.job_number ILIKE ${"%" + search + "%"}
               OR c.name ILIKE ${"%" + search + "%"}
               OR s.suburb ILIKE ${"%" + search + "%"}
               OR s.address_line1 ILIKE ${"%" + search + "%"})`
        : sql``}
    ORDER BY
      j.is_priority DESC,
      CASE j.status
        WHEN 'in_progress' THEN 1 WHEN 'scheduled' THEN 2 WHEN 'won' THEN 3
        WHEN 'quoted' THEN 4 WHEN 'lead' THEN 5 WHEN 'complete' THEN 6
        WHEN 'invoiced' THEN 7 WHEN 'paid' THEN 8 ELSE 9 END,
      j.start_date DESC NULLS LAST,
      j.job_number DESC
    LIMIT 300
  `);
}

export type JobDetail = {
  id: string;
  jobNumber: string;
  title: string;
  description: string | null;
  status: string;
  isPriority: boolean;
  notes: string | null;
  leadSource: string | null;
  lostReason: string | null;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  targetMarginBp: number;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  siteId: string | null;
  siteLabel: string | null;
  siteAddress: string | null;
  siteSuburb: string | null;
  siteState: string | null;
  sitePostcode: string | null;
  accessNotes: string | null;
  parkingNotes: string | null;
  hazardNotes: string | null;
  jobTypeId: string | null;
  jobTypeName: string | null;
  sourceQuoteId: string | null;
};

export async function getJob(id: string): Promise<JobDetail | null> {
  const [row] = await rows<JobDetail>(sql`
    SELECT
      j.id, j.job_number AS "jobNumber", j.title, j.description, j.status::text AS status,
      j.is_priority AS "isPriority", j.notes, j.lead_source AS "leadSource",
      j.lost_reason AS "lostReason",
      j.start_date::text AS "startDate", j.end_date::text AS "endDate",
      j.actual_start_date::text AS "actualStartDate", j.actual_end_date::text AS "actualEndDate",
      j.target_margin_bp AS "targetMarginBp",
      j.client_id AS "clientId", c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail",
      j.site_id AS "siteId", s.label AS "siteLabel", s.address_line1 AS "siteAddress",
      s.suburb AS "siteSuburb", s.state AS "siteState", s.postcode AS "sitePostcode",
      s.access_notes AS "accessNotes", s.parking_notes AS "parkingNotes", s.hazard_notes AS "hazardNotes",
      j.job_type_id AS "jobTypeId", jt.name AS "jobTypeName",
      j.source_quote_id AS "sourceQuoteId"
    FROM jobs j
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN sites s ON s.id = j.site_id
    LEFT JOIN job_types jt ON jt.id = j.job_type_id
    WHERE j.id = ${id} AND j.deleted_at IS NULL
  `);
  return row ?? null;
}

export type JobFinancials = {
  jobId: string;
  contractValueCents: number;
  approvedVariationsCents: number;
  revisedContractCents: number;
  budgetTotalCents: number;
  revisedBudgetCents: number;
  approvedVariationCostCents: number;
  budgetLabourCents: number;
  budgetMaterialCents: number;
  budgetSubcontractorCents: number;
  budgetPlantCents: number;
  budgetOtherCents: number;
  actualLabourCents: number;
  actualLabourMinutes: number;
  pendingLabourCents: number;
  actualMaterialCents: number;
  actualSubcontractorCents: number;
  actualPlantCents: number;
  actualOtherCents: number;
  actualTotalCents: number;
  committedCents: number;
  invoicedExTaxCents: number;
  paidIncTaxCents: number;
  outstandingCents: number;
  unbilledBillableCents: number;
  profitCents: number;
  budgetVarianceCents: number;
  forecastVarianceCents: number;
};

export async function getJobFinancials(jobId: string): Promise<JobFinancials | null> {
  const [row] = await rows<JobFinancials>(sql`
    SELECT
      job_id AS "jobId",
      contract_value_cents::int AS "contractValueCents",
      approved_variations_cents::int AS "approvedVariationsCents",
      revised_contract_cents::int AS "revisedContractCents",
      budget_total_cents::int AS "budgetTotalCents",
      revised_budget_cents::int AS "revisedBudgetCents",
      approved_variation_cost_cents::int AS "approvedVariationCostCents",
      budget_labour_cents::int AS "budgetLabourCents",
      budget_material_cents::int AS "budgetMaterialCents",
      budget_subcontractor_cents::int AS "budgetSubcontractorCents",
      budget_plant_cents::int AS "budgetPlantCents",
      budget_other_cents::int AS "budgetOtherCents",
      actual_labour_cents::int AS "actualLabourCents",
      actual_labour_minutes::int AS "actualLabourMinutes",
      pending_labour_cents::int AS "pendingLabourCents",
      actual_material_cents::int AS "actualMaterialCents",
      actual_subcontractor_cents::int AS "actualSubcontractorCents",
      actual_plant_cents::int AS "actualPlantCents",
      actual_other_cents::int AS "actualOtherCents",
      actual_total_cents::int AS "actualTotalCents",
      committed_cents::int AS "committedCents",
      invoiced_ex_tax_cents::int AS "invoicedExTaxCents",
      paid_inc_tax_cents::int AS "paidIncTaxCents",
      outstanding_cents::int AS "outstandingCents",
      unbilled_billable_cents::int AS "unbilledBillableCents",
      profit_cents::int AS "profitCents",
      budget_variance_cents::int AS "budgetVarianceCents",
      forecast_variance_cents::int AS "forecastVarianceCents"
    FROM job_financials WHERE job_id = ${jobId}
  `);
  return row ?? null;
}

export type JobCrewMember = { userId: string; fullName: string; roleOnJob: string | null; phone: string | null };

export async function getJobCrew(jobId: string): Promise<JobCrewMember[]> {
  return rows<JobCrewMember>(sql`
    SELECT ja.user_id AS "userId", u.full_name AS "fullName", ja.role_on_job AS "roleOnJob", u.phone
    FROM job_assignments ja
    JOIN users u ON u.id = ja.user_id
    WHERE ja.job_id = ${jobId} AND ja.deleted_at IS NULL
    ORDER BY CASE ja.role_on_job WHEN 'supervisor' THEN 1 WHEN 'lead' THEN 2 ELSE 3 END, u.full_name
  `);
}

export type JobTimelineEvent = {
  at: string;
  kind: string;
  summary: string;
  detail: string | null;
  actor: string | null;
  href: string | null;
};

/** One merged stream: status changes, notes, money, photos and site events. */
export async function getJobTimeline(jobId: string, limit = 40): Promise<JobTimelineEvent[]> {
  return rows<JobTimelineEvent>(sql`
    (
      SELECT h.created_at::text AS at, 'status' AS kind,
             'Moved to ' || h.to_status AS summary, h.note AS detail,
             u.full_name AS actor, NULL::text AS href
      FROM job_status_history h LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.job_id = ${jobId}
    ) UNION ALL (
      SELECT n.created_at::text, 'note', n.body, NULL, u.full_name, NULL
      FROM job_notes n LEFT JOIN users u ON u.id = n.created_by
      WHERE n.job_id = ${jobId} AND n.deleted_at IS NULL
    ) UNION ALL (
      SELECT i.created_at::text, 'invoice',
             'Invoice ' || i.invoice_number || ' raised', i.notes,
             u.full_name, '/invoices/' || i.id
      FROM invoices i LEFT JOIN users u ON u.id = i.created_by
      WHERE i.job_id = ${jobId} AND i.deleted_at IS NULL
    ) UNION ALL (
      SELECT v.created_at::text, 'variation',
             v.variation_number || ' — ' || v.title, v.description,
             u.full_name, NULL
      FROM variations v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.job_id = ${jobId} AND v.deleted_at IS NULL
    ) UNION ALL (
      SELECT p.taken_at::text, 'photo', COALESCE(p.caption, 'Site photo'), NULL,
             u.full_name, NULL
      FROM job_photos p LEFT JOIN users u ON u.id = p.uploaded_by
      WHERE p.job_id = ${jobId} AND p.deleted_at IS NULL
    ) UNION ALL (
      SELECT inc.occurred_at::text, 'incident',
             'Incident ' || inc.incident_number || ' — ' || inc.severity::text,
             inc.description, u.full_name, '/compliance/incidents'
      FROM incidents inc LEFT JOIN users u ON u.id = inc.reported_by
      WHERE inc.job_id = ${jobId} AND inc.deleted_at IS NULL
    )
    ORDER BY at DESC
    LIMIT ${limit}
  `);
}

export type JobOption = { id: string; jobNumber: string; title: string; clientName: string; status: string };

export async function getJobOptions(includeClosed = false): Promise<JobOption[]> {
  return rows<JobOption>(sql`
    SELECT j.id, j.job_number AS "jobNumber", j.title, c.name AS "clientName", j.status::text AS status
    FROM jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.deleted_at IS NULL
      ${includeClosed ? sql`` : sql`AND j.status NOT IN ('paid','lost','cancelled')`}
    ORDER BY j.job_number DESC
  `);
}
