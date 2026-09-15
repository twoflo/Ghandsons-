import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type DateRange = { from: string; to: string };

/* ------------------------------ profit per job ---------------------------- */

export type JobProfitRow = {
  jobId: string;
  jobNumber: string;
  title: string;
  clientName: string;
  status: string;
  endDate: string | null;
  contractCents: number;
  actualCostCents: number;
  profitCents: number;
  marginBp: number;
  invoicedCents: number;
  outstandingCents: number;
  budgetVarianceCents: number;
};

/**
 * Profit per job, for finished jobs only by default.
 *
 * A job that's half done has half its costs in and (usually) more than half
 * its contract claimed, so including them would make every report look
 * wonderful. `includeLive` is there when the owner wants the forecast view.
 */
export async function getJobProfit(
  range: DateRange,
  includeLive = false,
): Promise<JobProfitRow[]> {
  return rows<JobProfitRow>(sql`
    SELECT
      f.job_id AS "jobId", f.job_number AS "jobNumber", f.title,
      c.name AS "clientName", f.status::text AS status,
      j.actual_end_date::text AS "endDate",
      f.revised_contract_cents::int AS "contractCents",
      f.actual_total_cents::int AS "actualCostCents",
      (f.revised_contract_cents - f.actual_total_cents)::int AS "profitCents",
      CASE WHEN f.revised_contract_cents > 0
           THEN ROUND(10000.0 * (f.revised_contract_cents - f.actual_total_cents) / f.revised_contract_cents)::int
           ELSE 0 END AS "marginBp",
      f.invoiced_ex_tax_cents::int AS "invoicedCents",
      f.outstanding_cents::int AS "outstandingCents",
      f.budget_variance_cents::int AS "budgetVarianceCents"
    FROM job_financials f
    JOIN jobs j ON j.id = f.job_id
    JOIN clients c ON c.id = f.client_id
    WHERE f.revised_contract_cents > 0
      ${includeLive
        ? sql`AND f.status NOT IN ('lead','quoted','lost','cancelled')`
        : sql`AND f.status IN ('complete','invoiced','paid')`}
      AND (j.actual_end_date IS NULL
           OR j.actual_end_date BETWEEN ${range.from}::date AND ${range.to}::date)
    ORDER BY (f.revised_contract_cents - f.actual_total_cents) DESC
  `);
}

/* ----------------------------- profit by month ---------------------------- */

export type MonthProfitRow = {
  month: string;
  label: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
};

/**
 * Revenue and cost by the month they were booked.
 *
 * Revenue is invoices issued ex GST; cost is expenses dated in the month plus
 * approved labour worked in it. It is a cash-flow-shaped view of trading, not
 * accrual accounting — good enough to see the shape of the year, and the
 * caveat is printed on the page so nobody mistakes it for the tax return.
 */
export async function getProfitByMonth(range: DateRange): Promise<MonthProfitRow[]> {
  return rows<MonthProfitRow>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', ${range.from}::date),
        date_trunc('month', ${range.to}::date),
        '1 month'
      )::date AS month
    )
    SELECT
      m.month::text AS month,
      to_char(m.month, 'Mon YY') AS label,
      COALESCE((
        SELECT SUM(i.subtotal_cents) FROM invoices i
        WHERE i.deleted_at IS NULL AND i.status <> 'draft' AND i.status <> 'void'
          AND date_trunc('month', i.issue_date) = m.month
      ), 0)::int AS "revenueCents",
      (
        COALESCE((
          SELECT SUM(e.subtotal_cents) FROM expenses e
          WHERE e.deleted_at IS NULL AND date_trunc('month', e.expense_date) = m.month
        ), 0)
        +
        COALESCE((
          SELECT SUM(te.cost_cents) FROM time_entries te
          WHERE te.deleted_at IS NULL AND te.status = 'approved'
            AND date_trunc('month', te.work_date) = m.month
        ), 0)
      )::int AS "costCents",
      (
        COALESCE((
          SELECT SUM(i.subtotal_cents) FROM invoices i
          WHERE i.deleted_at IS NULL AND i.status <> 'draft' AND i.status <> 'void'
            AND date_trunc('month', i.issue_date) = m.month
        ), 0)
        - COALESCE((
          SELECT SUM(e.subtotal_cents) FROM expenses e
          WHERE e.deleted_at IS NULL AND date_trunc('month', e.expense_date) = m.month
        ), 0)
        - COALESCE((
          SELECT SUM(te.cost_cents) FROM time_entries te
          WHERE te.deleted_at IS NULL AND te.status = 'approved'
            AND date_trunc('month', te.work_date) = m.month
        ), 0)
      )::int AS "profitCents"
    FROM months m
    ORDER BY m.month
  `);
}

/* ------------------------------- cash in/out ------------------------------ */

export type CashRow = {
  month: string;
  label: string;
  inCents: number;
  outCents: number;
  netCents: number;
};

/** Money that actually moved: payments banked against expenses paid. */
export async function getCashFlow(range: DateRange): Promise<CashRow[]> {
  return rows<CashRow>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', ${range.from}::date),
        date_trunc('month', ${range.to}::date),
        '1 month'
      )::date AS month
    )
    SELECT
      m.month::text AS month,
      to_char(m.month, 'Mon YY') AS label,
      COALESCE((
        SELECT SUM(p.amount_cents) FROM payments p
        WHERE p.deleted_at IS NULL AND date_trunc('month', p.paid_on) = m.month
      ), 0)::int AS "inCents",
      COALESCE((
        SELECT SUM(e.total_cents) FROM expenses e
        WHERE e.deleted_at IS NULL AND date_trunc('month', e.expense_date) = m.month
      ), 0)::int AS "outCents",
      (
        COALESCE((SELECT SUM(p.amount_cents) FROM payments p
          WHERE p.deleted_at IS NULL AND date_trunc('month', p.paid_on) = m.month), 0)
        - COALESCE((SELECT SUM(e.total_cents) FROM expenses e
          WHERE e.deleted_at IS NULL AND date_trunc('month', e.expense_date) = m.month), 0)
      )::int AS "netCents"
    FROM months m
    ORDER BY m.month
  `);
}

/* ---------------------------- aged receivables ---------------------------- */

export type AgedRow = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  jobNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
  balanceCents: number;
  daysOverdue: number;
  bucket: string;
};

export async function getAgedReceivables(): Promise<AgedRow[]> {
  return rows<AgedRow>(sql`
    SELECT a.invoice_id AS "invoiceId", a.invoice_number AS "invoiceNumber",
           a.client_name AS "clientName", j.job_number AS "jobNumber",
           a.issue_date::text AS "issueDate", a.due_date::text AS "dueDate",
           a.total_cents::int AS "totalCents", a.balance_cents::int AS "balanceCents",
           a.days_overdue AS "daysOverdue", a.bucket
    FROM aged_receivables a
    LEFT JOIN jobs j ON j.id = a.job_id
    ORDER BY a.days_overdue DESC, a.balance_cents DESC
  `);
}

/* ------------------------------- tax summary ------------------------------ */

export type TaxPeriodRow = {
  period: string;
  label: string;
  salesIncGstCents: number;
  gstCollectedCents: number;
  purchasesIncGstCents: number;
  gstPaidCents: number;
  netGstCents: number;
};

/**
 * The numbers the accountant asks for at BAS time: GST collected on sales,
 * GST paid on purchases, and the difference. Cash basis — which is what most
 * businesses this size report on — and the page says so.
 */
export async function getTaxSummary(range: DateRange): Promise<TaxPeriodRow[]> {
  return rows<TaxPeriodRow>(sql`
    WITH quarters AS (
      SELECT generate_series(
        date_trunc('quarter', ${range.from}::date),
        date_trunc('quarter', ${range.to}::date),
        '3 months'
      )::date AS period
    )
    SELECT
      q.period::text AS period,
      'Q' || to_char(q.period, 'Q') || ' ' || to_char(q.period, 'Mon yyyy') AS label,
      COALESCE((
        SELECT SUM(i.total_cents) FROM invoices i
        WHERE i.deleted_at IS NULL AND i.status <> 'draft' AND i.status <> 'void'
          AND date_trunc('quarter', i.issue_date) = q.period
      ), 0)::int AS "salesIncGstCents",
      COALESCE((
        SELECT SUM(i.tax_cents) FROM invoices i
        WHERE i.deleted_at IS NULL AND i.status <> 'draft' AND i.status <> 'void'
          AND date_trunc('quarter', i.issue_date) = q.period
      ), 0)::int AS "gstCollectedCents",
      COALESCE((
        SELECT SUM(e.total_cents) FROM expenses e
        WHERE e.deleted_at IS NULL AND date_trunc('quarter', e.expense_date) = q.period
      ), 0)::int AS "purchasesIncGstCents",
      COALESCE((
        SELECT SUM(e.tax_cents) FROM expenses e
        WHERE e.deleted_at IS NULL AND date_trunc('quarter', e.expense_date) = q.period
      ), 0)::int AS "gstPaidCents",
      (
        COALESCE((SELECT SUM(i.tax_cents) FROM invoices i
          WHERE i.deleted_at IS NULL AND i.status <> 'draft' AND i.status <> 'void'
            AND date_trunc('quarter', i.issue_date) = q.period), 0)
        - COALESCE((SELECT SUM(e.tax_cents) FROM expenses e
          WHERE e.deleted_at IS NULL AND date_trunc('quarter', e.expense_date) = q.period), 0)
      )::int AS "netGstCents"
    FROM quarters q
    ORDER BY q.period
  `);
}

export type ExpenseByCategoryRow = {
  categoryName: string;
  kind: string;
  totalCents: number;
  taxCents: number;
  count: number;
};

export async function getExpensesByCategory(range: DateRange): Promise<ExpenseByCategoryRow[]> {
  return rows<ExpenseByCategoryRow>(sql`
    SELECT COALESCE(ec.name, 'Uncategorised') AS "categoryName",
           COALESCE(ec.kind::text, 'other') AS kind,
           SUM(e.total_cents)::int AS "totalCents",
           SUM(e.tax_cents)::int AS "taxCents",
           COUNT(*)::int AS count
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.deleted_at IS NULL
      AND e.expense_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY ec.name, ec.kind
    ORDER BY SUM(e.total_cents) DESC
  `);
}

export type ReportTotals = {
  revenueCents: number;
  costCents: number;
  profitCents: number;
  cashInCents: number;
  cashOutCents: number;
  gstOwedCents: number;
  outstandingCents: number;
};

export async function getReportTotals(range: DateRange): Promise<ReportTotals> {
  const [row] = await rows<ReportTotals>(sql`
    SELECT
      COALESCE((SELECT SUM(subtotal_cents) FROM invoices
        WHERE deleted_at IS NULL AND status NOT IN ('draft','void')
          AND issue_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::int AS "revenueCents",
      (
        COALESCE((SELECT SUM(subtotal_cents) FROM expenses
          WHERE deleted_at IS NULL AND expense_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)
        + COALESCE((SELECT SUM(cost_cents) FROM time_entries
          WHERE deleted_at IS NULL AND status = 'approved'
            AND work_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)
      )::int AS "costCents",
      0::int AS "profitCents",
      COALESCE((SELECT SUM(amount_cents) FROM payments
        WHERE deleted_at IS NULL AND paid_on BETWEEN ${range.from}::date AND ${range.to}::date), 0)::int AS "cashInCents",
      COALESCE((SELECT SUM(total_cents) FROM expenses
        WHERE deleted_at IS NULL AND expense_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::int AS "cashOutCents",
      (
        COALESCE((SELECT SUM(tax_cents) FROM invoices
          WHERE deleted_at IS NULL AND status NOT IN ('draft','void')
            AND issue_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)
        - COALESCE((SELECT SUM(tax_cents) FROM expenses
          WHERE deleted_at IS NULL AND expense_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)
      )::int AS "gstOwedCents",
      COALESCE((SELECT SUM(balance_cents) FROM invoices
        WHERE deleted_at IS NULL AND status IN ('sent','part_paid','overdue')), 0)::int AS "outstandingCents"
  `);
  const totals = row ?? {
    revenueCents: 0, costCents: 0, profitCents: 0, cashInCents: 0,
    cashOutCents: 0, gstOwedCents: 0, outstandingCents: 0,
  };
  totals.profitCents = totals.revenueCents - totals.costCents;
  return totals;
}
