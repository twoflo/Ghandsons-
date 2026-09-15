import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type TimeEntryRow = {
  id: string;
  userId: string;
  userName: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  workDate: string;
  startedAt: string | null;
  endedAt: string | null;
  breakMinutes: number;
  minutes: number;
  description: string | null;
  status: string;
  source: string;
  costCents: number;
  chargeCents: number;
  rejectedReason: string | null;
};

export async function listTimeEntries(filters: {
  userId?: string;
  weekStart?: string;
  jobId?: string;
  status?: string;
}): Promise<TimeEntryRow[]> {
  return rows<TimeEntryRow>(sql`
    SELECT te.id, te.user_id AS "userId", u.full_name AS "userName",
           te.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           te.work_date::text AS "workDate",
           te.started_at::text AS "startedAt", te.ended_at::text AS "endedAt",
           te.break_minutes AS "breakMinutes", te.minutes,
           te.description, te.status::text AS status, te.source::text AS source,
           te.cost_cents AS "costCents", te.charge_cents AS "chargeCents",
           te.rejected_reason AS "rejectedReason"
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    LEFT JOIN jobs j ON j.id = te.job_id
    WHERE te.deleted_at IS NULL
      ${filters.userId ? sql`AND te.user_id = ${filters.userId}` : sql``}
      ${filters.jobId ? sql`AND te.job_id = ${filters.jobId}` : sql``}
      ${filters.status ? sql`AND te.status::text = ${filters.status}` : sql``}
      ${filters.weekStart
        ? sql`AND te.work_date BETWEEN ${filters.weekStart}::date AND ${filters.weekStart}::date + 6`
        : sql``}
    ORDER BY te.work_date DESC, u.full_name, te.started_at NULLS LAST
    LIMIT 500
  `);
}

export type TimesheetWeekRow = {
  id: string | null;
  userId: string;
  userName: string;
  weekStart: string;
  status: string;
  totalMinutes: number;
  totalCostCents: number;
  totalChargeCents: number;
  entryCount: number;
  jobCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
};

/**
 * One row per worker for a week, built from the entries rather than read off
 * the timesheet_weeks table — so a week with loose entries and no bundle
 * still shows up and can be approved.
 */
export async function listTimesheetWeeks(weekStart: string): Promise<TimesheetWeekRow[]> {
  return rows<TimesheetWeekRow>(sql`
    SELECT
      tw.id,
      u.id AS "userId", u.full_name AS "userName",
      ${weekStart}::text AS "weekStart",
      COALESCE(
        CASE
          WHEN COUNT(*) FILTER (WHERE te.status = 'open') > 0 THEN 'open'
          WHEN COUNT(*) FILTER (WHERE te.status = 'draft') > 0 THEN 'draft'
          WHEN COUNT(*) FILTER (WHERE te.status = 'rejected') > 0 THEN 'rejected'
          WHEN COUNT(*) FILTER (WHERE te.status = 'submitted') > 0 THEN 'submitted'
          WHEN COUNT(*) > 0 THEN 'approved'
        END, 'draft') AS status,
      COALESCE(SUM(te.minutes), 0)::int AS "totalMinutes",
      COALESCE(SUM(te.cost_cents), 0)::int AS "totalCostCents",
      COALESCE(SUM(te.charge_cents), 0)::int AS "totalChargeCents",
      COUNT(te.id)::int AS "entryCount",
      COUNT(DISTINCT te.job_id)::int AS "jobCount",
      MAX(tw.submitted_at)::text AS "submittedAt",
      MAX(tw.approved_at)::text AS "approvedAt",
      MAX(te.rejected_reason) AS "rejectedReason"
    FROM users u
    LEFT JOIN time_entries te
      ON te.user_id = u.id AND te.deleted_at IS NULL
     AND te.work_date BETWEEN ${weekStart}::date AND ${weekStart}::date + 6
    LEFT JOIN timesheet_weeks tw
      ON tw.user_id = u.id AND tw.week_start = ${weekStart}::date AND tw.deleted_at IS NULL
    WHERE u.deleted_at IS NULL AND u.is_active
    GROUP BY tw.id, u.id, u.full_name
    HAVING COUNT(te.id) > 0
    ORDER BY u.full_name
  `);
}

export type WeekDayTotal = { workDate: string; minutes: number };

export async function getWeekByDay(userId: string, weekStart: string): Promise<WeekDayTotal[]> {
  return rows<WeekDayTotal>(sql`
    SELECT d::date::text AS "workDate",
           COALESCE((
             SELECT SUM(te.minutes) FROM time_entries te
             WHERE te.user_id = ${userId} AND te.work_date = d::date AND te.deleted_at IS NULL
           ), 0)::int AS minutes
    FROM generate_series(${weekStart}::date, ${weekStart}::date + 6, '1 day') d
  `);
}

export type PendingWeek = { userId: string; userName: string; weekStart: string; totalMinutes: number; totalCostCents: number };

export async function listPendingApprovalWeeks(): Promise<PendingWeek[]> {
  return rows<PendingWeek>(sql`
    SELECT te.user_id AS "userId", u.full_name AS "userName",
           (date_trunc('week', te.work_date)::date)::text AS "weekStart",
           SUM(te.minutes)::int AS "totalMinutes",
           SUM(te.cost_cents)::int AS "totalCostCents"
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.deleted_at IS NULL AND te.status = 'submitted'
    GROUP BY te.user_id, u.full_name, date_trunc('week', te.work_date)
    ORDER BY date_trunc('week', te.work_date), u.full_name
  `);
}
