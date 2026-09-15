import { sql } from "drizzle-orm";
import { db } from "@/db";

/** drizzle's execute() returns a row array at runtime; this keeps callers honest. */
async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const result = await db.execute(query);
  return result as unknown as T[];
}

export type TodayJob = {
  eventId: string;
  jobId: string | null;
  jobNumber: string | null;
  title: string;
  status: string | null;
  kind: string;
  clientName: string | null;
  suburb: string | null;
  addressLine1: string | null;
  crew: string[];
  notes: string | null;
};

export async function getTodaysWork(userId?: string): Promise<TodayJob[]> {
  return rows<TodayJob>(sql`
    SELECT
      e.id                          AS "eventId",
      e.job_id                      AS "jobId",
      j.job_number                  AS "jobNumber",
      COALESCE(e.title, j.title)    AS title,
      j.status::text                AS status,
      e.kind                        AS kind,
      c.name                        AS "clientName",
      s.suburb                      AS suburb,
      s.address_line1               AS "addressLine1",
      e.notes                       AS notes,
      COALESCE(
        ARRAY(
          SELECT u.full_name FROM schedule_assignments sa
          JOIN users u ON u.id = sa.user_id
          WHERE sa.event_id = e.id AND sa.deleted_at IS NULL
          ORDER BY u.full_name
        ), '{}'
      )                             AS crew
    FROM schedule_events e
    LEFT JOIN jobs j    ON j.id = e.job_id
    LEFT JOIN clients c ON c.id = j.client_id
    LEFT JOIN sites s   ON s.id = COALESCE(e.site_id, j.site_id)
    WHERE e.deleted_at IS NULL
      AND CURRENT_DATE BETWEEN e.start_at::date AND e.end_at::date
      ${userId ? sql`AND EXISTS (
        SELECT 1 FROM schedule_assignments sa
        WHERE sa.event_id = e.id AND sa.user_id = ${userId} AND sa.deleted_at IS NULL
      )` : sql``}
    ORDER BY e.start_at, j.job_number
  `);
}

export type WeekDayLoad = { day: string; jobCount: number; crewCount: number };

export async function getWeekLoad(): Promise<WeekDayLoad[]> {
  return rows<WeekDayLoad>(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('week', CURRENT_DATE)::date,
        date_trunc('week', CURRENT_DATE)::date + 6,
        '1 day'
      )::date AS day
    )
    SELECT
      d.day::text                                                 AS day,
      COUNT(DISTINCT e.job_id)::int                               AS "jobCount",
      COUNT(DISTINCT sa.user_id)::int                             AS "crewCount"
    FROM days d
    LEFT JOIN schedule_events e
      ON e.deleted_at IS NULL AND d.day BETWEEN e.start_at::date AND e.end_at::date
    LEFT JOIN schedule_assignments sa
      ON sa.event_id = e.id AND sa.deleted_at IS NULL
    GROUP BY d.day
    ORDER BY d.day
  `);
}

export type MoneySnapshot = {
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
  dueThisWeekCents: number;
  draftCount: number;
  paidLast30Cents: number;
  unbilledBillableCents: number;
};

export async function getMoneySnapshot(): Promise<MoneySnapshot> {
  const [row] = await rows<MoneySnapshot>(sql`
    SELECT
      COALESCE(SUM(i.balance_cents) FILTER (WHERE i.status IN ('sent','part_paid','overdue')), 0)::int AS "outstandingCents",
      COALESCE(SUM(i.balance_cents) FILTER (WHERE i.status IN ('sent','part_paid','overdue') AND i.due_date < CURRENT_DATE), 0)::int AS "overdueCents",
      COUNT(*) FILTER (WHERE i.status IN ('sent','part_paid','overdue') AND i.due_date < CURRENT_DATE)::int AS "overdueCount",
      COALESCE(SUM(i.balance_cents) FILTER (WHERE i.status IN ('sent','part_paid') AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7), 0)::int AS "dueThisWeekCents",
      COUNT(*) FILTER (WHERE i.status = 'draft')::int AS "draftCount",
      (SELECT COALESCE(SUM(p.amount_cents), 0)::int FROM payments p
        WHERE p.deleted_at IS NULL AND p.paid_on >= CURRENT_DATE - 30) AS "paidLast30Cents",
      -- Only jobs still in play: a paid job's unbilled costs are water
      -- under the bridge, not money the owner can still claim.
      (SELECT COALESCE(SUM(e.subtotal_cents), 0)::int FROM expenses e
        JOIN jobs j ON j.id = e.job_id
        WHERE e.deleted_at IS NULL AND e.is_billable AND e.billed_invoice_line_id IS NULL
          AND j.deleted_at IS NULL
          AND j.status NOT IN ('paid','lost','cancelled')) AS "unbilledBillableCents"
    FROM invoices i
    WHERE i.deleted_at IS NULL
  `);
  return (
    row ?? {
      outstandingCents: 0, overdueCents: 0, overdueCount: 0, dueThisWeekCents: 0,
      draftCount: 0, paidLast30Cents: 0, unbilledBillableCents: 0,
    }
  );
}

export type OverBudgetJob = {
  jobId: string;
  jobNumber: string;
  title: string;
  clientName: string;
  status: string;
  revisedBudgetCents: number;
  actualTotalCents: number;
  budgetVarianceCents: number;
  forecastVarianceCents: number;
};

/** Jobs already over, or forecast to go over once committed costs land. */
export async function getBudgetRisks(): Promise<OverBudgetJob[]> {
  return rows<OverBudgetJob>(sql`
    SELECT
      f.job_id                      AS "jobId",
      f.job_number                  AS "jobNumber",
      f.title                       AS title,
      c.name                        AS "clientName",
      f.status::text                AS status,
      f.revised_budget_cents::int   AS "revisedBudgetCents",
      f.actual_total_cents::int     AS "actualTotalCents",
      f.budget_variance_cents::int  AS "budgetVarianceCents",
      f.forecast_variance_cents::int AS "forecastVarianceCents"
    FROM job_financials f
    JOIN clients c ON c.id = f.client_id
    WHERE f.revised_budget_cents > 0
      AND (f.budget_variance_cents > 0 OR f.forecast_variance_cents > 0)
      AND f.status NOT IN ('lost','cancelled')
    ORDER BY f.budget_variance_cents DESC
    LIMIT 6
  `);
}

export type ExpiryItem = {
  id: string;
  name: string;
  subjectLabel: string;
  kind: string;
  expiryDate: string;
  daysLeft: number;
};

export async function getUpcomingExpiries(withinDays = 60): Promise<ExpiryItem[]> {
  return rows<ExpiryItem>(sql`
    SELECT
      ci.id                                        AS id,
      ci.name                                      AS name,
      ci.subject_label                             AS "subjectLabel",
      ci.kind::text                                AS kind,
      ci.expiry_date::text                         AS "expiryDate",
      (ci.expiry_date - CURRENT_DATE)::int         AS "daysLeft"
    FROM compliance_items ci
    WHERE ci.deleted_at IS NULL
      AND ci.expiry_date IS NOT NULL
      AND ci.expiry_date <= CURRENT_DATE + ${withinDays}::int
    ORDER BY ci.expiry_date
    LIMIT 8
  `);
}

export type ReceiptQueueSummary = { needsReview: number; processing: number; failed: number };

export async function getReceiptQueueSummary(): Promise<ReceiptQueueSummary> {
  const [row] = await rows<ReceiptQueueSummary>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'needs_review')::int AS "needsReview",
      COUNT(*) FILTER (WHERE status IN ('uploaded','processing'))::int AS "processing",
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM receipt_uploads WHERE deleted_at IS NULL
  `);
  return row ?? { needsReview: 0, processing: 0, failed: 0 };
}

export type PipelineSummary = { status: string; jobCount: number; valueCents: number };

export async function getPipeline(): Promise<PipelineSummary[]> {
  return rows<PipelineSummary>(sql`
    SELECT
      j.status::text                                        AS status,
      COUNT(*)::int                                         AS "jobCount",
      COALESCE(SUM(
        CASE WHEN j.contract_value_cents > 0 THEN j.contract_value_cents
             ELSE COALESCE((SELECT q.subtotal_cents FROM quotes q
                             WHERE q.job_id = j.id AND q.deleted_at IS NULL
                             ORDER BY q.created_at DESC LIMIT 1), 0)
        END
      ), 0)::int                                            AS "valueCents"
    FROM jobs j
    WHERE j.deleted_at IS NULL AND j.status NOT IN ('lost','cancelled')
    GROUP BY j.status
  `);
}

export type ClockedOn = {
  entryId: string;
  userId: string;
  fullName: string;
  jobNumber: string | null;
  jobTitle: string | null;
  startedAt: string;
  minutesSoFar: number;
};

export async function getClockedOn(): Promise<ClockedOn[]> {
  return rows<ClockedOn>(sql`
    SELECT
      te.id                                                      AS "entryId",
      te.user_id                                                 AS "userId",
      u.full_name                                                AS "fullName",
      j.job_number                                               AS "jobNumber",
      j.title                                                    AS "jobTitle",
      te.started_at::text                                        AS "startedAt",
      (EXTRACT(EPOCH FROM (now() - te.started_at)) / 60)::int     AS "minutesSoFar"
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    LEFT JOIN jobs j ON j.id = te.job_id
    WHERE te.status = 'open' AND te.deleted_at IS NULL
    ORDER BY te.started_at
  `);
}

export type PendingApproval = {
  kind: "timesheet" | "variation" | "quote";
  id: string;
  label: string;
  detail: string;
  href: string;
  amountCents: number | null;
  ageDays: number;
};

export async function getPendingApprovals(): Promise<PendingApproval[]> {
  const timesheets = await rows<PendingApproval>(sql`
    SELECT 'timesheet'::text AS kind, tw.id AS id,
           u.full_name AS label,
           (tw.total_minutes / 60.0)::numeric(10,1)::text || ' hrs, week of ' || to_char(tw.week_start, 'DD Mon') AS detail,
           '/timesheets/approve' AS href,
           tw.total_cost_cents::int AS "amountCents",
           (CURRENT_DATE - tw.week_start)::int AS "ageDays"
    FROM timesheet_weeks tw
    JOIN users u ON u.id = tw.user_id
    WHERE tw.status = 'submitted' AND tw.deleted_at IS NULL
    ORDER BY tw.week_start
  `);

  const variations = await rows<PendingApproval>(sql`
    SELECT 'variation'::text AS kind, v.id AS id,
           v.variation_number || ' — ' || v.title AS label,
           j.job_number || ' · ' || c.name AS detail,
           '/jobs/' || v.job_id || '/variations' AS href,
           v.total_cents::int AS "amountCents",
           (CURRENT_DATE - v.raised_on)::int AS "ageDays"
    FROM variations v
    JOIN jobs j ON j.id = v.job_id
    JOIN clients c ON c.id = j.client_id
    WHERE v.status = 'submitted' AND v.deleted_at IS NULL
    ORDER BY v.raised_on
  `);

  return [...timesheets, ...variations].sort((a, b) => b.ageDays - a.ageDays);
}

export type FieldDayEntry = {
  entryId: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  minutes: number;
  status: string;
  description: string | null;
};

export async function getMyDay(userId: string): Promise<FieldDayEntry[]> {
  return rows<FieldDayEntry>(sql`
    SELECT te.id AS "entryId", te.job_id AS "jobId", j.job_number AS "jobNumber",
           j.title AS "jobTitle", te.minutes AS minutes, te.status::text AS status,
           te.description AS description
    FROM time_entries te
    LEFT JOIN jobs j ON j.id = te.job_id
    WHERE te.user_id = ${userId} AND te.work_date = CURRENT_DATE AND te.deleted_at IS NULL
    ORDER BY te.started_at NULLS LAST
  `);
}
