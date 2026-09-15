import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type OpenEntry = {
  id: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  startedAt: string;
  minutesSoFar: number;
} | null;

export async function getOpenEntry(userId: string): Promise<OpenEntry> {
  const [row] = await rows<NonNullable<OpenEntry>>(sql`
    SELECT te.id, te.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           te.started_at::text AS "startedAt",
           (EXTRACT(EPOCH FROM (now() - te.started_at)) / 60)::int AS "minutesSoFar"
    FROM time_entries te
    LEFT JOIN jobs j ON j.id = te.job_id
    WHERE te.user_id = ${userId} AND te.status = 'open' AND te.deleted_at IS NULL
    LIMIT 1
  `);
  return row ?? null;
}

export type ClockJobOption = { id: string; jobNumber: string; title: string; clientName: string; assigned: boolean };

/**
 * Jobs offered in the clock-on picker. A worker's own jobs float to the top
 * so the common case is one tap, but every live job stays selectable — crews
 * get moved around at 6am and the app shouldn't argue.
 */
export async function getJobsForClockOn(userId?: string): Promise<ClockJobOption[]> {
  return rows<ClockJobOption>(sql`
    SELECT j.id, j.job_number AS "jobNumber", j.title, c.name AS "clientName",
           ${userId
             ? sql`EXISTS (SELECT 1 FROM job_assignments ja
                           WHERE ja.job_id = j.id AND ja.user_id = ${userId} AND ja.deleted_at IS NULL)`
             : sql`false`} AS assigned
    FROM jobs j
    JOIN clients c ON c.id = j.client_id
    WHERE j.deleted_at IS NULL
      AND j.status IN ('won','scheduled','in_progress','complete')
    ORDER BY assigned DESC, j.job_number
  `);
}

export type CrewMember = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  employmentType: string | null;
  trade: string | null;
  costRateCents: number | null;
  chargeRateCents: number | null;
  standardHoursPerWeek: number | null;
  abn: string | null;
  startDate: string | null;
  minutesThisWeek: number;
  openJobs: number;
  expiredDocs: number;
};

export async function getCrew(): Promise<CrewMember[]> {
  return rows<CrewMember>(sql`
    SELECT
      u.id, u.full_name AS "fullName", u.email, u.phone, u.role::text AS role,
      u.is_active AS "isActive",
      wp.employment_type::text AS "employmentType", wp.trade,
      wp.cost_rate_cents AS "costRateCents", wp.charge_rate_cents AS "chargeRateCents",
      wp.standard_hours_per_week AS "standardHoursPerWeek", wp.abn, wp.start_date AS "startDate",
      COALESCE((
        SELECT SUM(te.minutes) FROM time_entries te
        WHERE te.user_id = u.id AND te.deleted_at IS NULL
          AND te.work_date >= date_trunc('week', CURRENT_DATE)::date
      ), 0)::int AS "minutesThisWeek",
      COALESCE((
        SELECT COUNT(DISTINCT ja.job_id) FROM job_assignments ja
        JOIN jobs j ON j.id = ja.job_id
        WHERE ja.user_id = u.id AND ja.deleted_at IS NULL AND j.deleted_at IS NULL
          AND j.status IN ('scheduled','in_progress')
      ), 0)::int AS "openJobs",
      COALESCE((
        SELECT COUNT(*) FROM compliance_items ci
        WHERE ci.subject_id = u.id AND ci.deleted_at IS NULL
          AND ci.expiry_date IS NOT NULL AND ci.expiry_date < CURRENT_DATE
      ), 0)::int AS "expiredDocs"
    FROM users u
    LEFT JOIN worker_profiles wp ON wp.user_id = u.id
    WHERE u.deleted_at IS NULL
    ORDER BY u.is_active DESC, u.full_name
  `);
}
