import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type ScheduleEvent = {
  id: string;
  jobId: string | null;
  jobNumber: string | null;
  jobStatus: string | null;
  clientName: string | null;
  title: string;
  kind: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  colour: string | null;
  jobTypeColour: string | null;
  siteSuburb: string | null;
  crew: Array<{ id: string; name: string }>;
};

export async function listEvents(from: string, to: string): Promise<ScheduleEvent[]> {
  return rows<ScheduleEvent>(sql`
    SELECT
      e.id, e.job_id AS "jobId", j.job_number AS "jobNumber", j.status::text AS "jobStatus",
      c.name AS "clientName",
      COALESCE(NULLIF(e.title, ''), j.title, 'Untitled') AS title,
      e.kind, e.start_at::date::text AS "startDate", e.end_at::date::text AS "endDate",
      e.notes, e.colour, jt.colour AS "jobTypeColour", s.suburb AS "siteSuburb",
      COALESCE((
        SELECT json_agg(json_build_object('id', u.id, 'name', u.full_name) ORDER BY u.full_name)
        FROM schedule_assignments sa
        JOIN users u ON u.id = sa.user_id
        WHERE sa.event_id = e.id AND sa.deleted_at IS NULL
      ), '[]'::json) AS crew
    FROM schedule_events e
    LEFT JOIN jobs j ON j.id = e.job_id
    LEFT JOIN clients c ON c.id = j.client_id
    LEFT JOIN job_types jt ON jt.id = j.job_type_id
    LEFT JOIN sites s ON s.id = COALESCE(e.site_id, j.site_id)
    WHERE e.deleted_at IS NULL
      AND e.start_at::date <= ${to}::date
      AND e.end_at::date >= ${from}::date
    ORDER BY e.start_at, j.job_number NULLS LAST
  `);
}

export type DoubleBooking = {
  userId: string;
  userName: string;
  day: string;
  events: Array<{ id: string; title: string; jobNumber: string | null }>;
};

/**
 * Two blocks on the same person on the same day.
 *
 * Deliberately per-day rather than per-hour: work is booked in whole days
 * here, and the thing that actually goes wrong is "Tyler is on the roof in
 * Ashgrove and the fit-off in Coorparoo on Tuesday", not a fifteen-minute
 * overlap. Leave counts as a booking, which is the point — that's the clash
 * people miss.
 */
export async function findDoubleBookings(from: string, to: string): Promise<DoubleBooking[]> {
  return rows<DoubleBooking>(sql`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, '1 day')::date AS day
    ),
    booked AS (
      SELECT sa.user_id, u.full_name, d.day, e.id, e.title, j.job_number
      FROM schedule_events e
      JOIN schedule_assignments sa ON sa.event_id = e.id AND sa.deleted_at IS NULL
      JOIN users u ON u.id = sa.user_id
      LEFT JOIN jobs j ON j.id = e.job_id
      JOIN days d ON d.day BETWEEN e.start_at::date AND e.end_at::date
      WHERE e.deleted_at IS NULL
        -- Weekends aren't normally worked, so an overlap there isn't a clash.
        AND EXTRACT(ISODOW FROM d.day) <= 5
    )
    SELECT user_id AS "userId", full_name AS "userName", day::text AS day,
           json_agg(json_build_object('id', id, 'title', title, 'jobNumber', job_number)) AS events
    FROM booked
    GROUP BY user_id, full_name, day
    HAVING COUNT(*) > 1
    ORDER BY day, full_name
  `);
}

export type UnscheduledJob = {
  id: string;
  jobNumber: string;
  title: string;
  clientName: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  jobTypeColour: string | null;
};

/** Won or scheduled work with nothing on the calendar — the drag-on list. */
export async function listUnscheduledJobs(): Promise<UnscheduledJob[]> {
  return rows<UnscheduledJob>(sql`
    SELECT j.id, j.job_number AS "jobNumber", j.title, c.name AS "clientName",
           j.status::text AS status, j.start_date::text AS "startDate",
           j.end_date::text AS "endDate", jt.colour AS "jobTypeColour"
    FROM jobs j
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN job_types jt ON jt.id = j.job_type_id
    WHERE j.deleted_at IS NULL
      AND j.status IN ('won','scheduled','in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM schedule_events e
        WHERE e.job_id = j.id AND e.deleted_at IS NULL AND e.end_at >= now() - interval '1 day'
      )
    ORDER BY j.start_date NULLS LAST, j.job_number
  `);
}

export type WorkerDay = {
  userId: string;
  fullName: string;
  role: string;
  events: Array<{ id: string; title: string; jobNumber: string | null; kind: string; colour: string | null }>;
};

/** One row per worker for a single day — the "who's where today" view. */
export async function getWorkerDay(day: string): Promise<WorkerDay[]> {
  return rows<WorkerDay>(sql`
    SELECT u.id AS "userId", u.full_name AS "fullName", u.role::text AS role,
      COALESCE((
        SELECT json_agg(json_build_object(
                 'id', e.id, 'title', COALESCE(NULLIF(e.title,''), j.title),
                 'jobNumber', j.job_number, 'kind', e.kind,
                 'colour', COALESCE(e.colour, jt.colour)) ORDER BY e.start_at)
        FROM schedule_assignments sa
        JOIN schedule_events e ON e.id = sa.event_id AND e.deleted_at IS NULL
        LEFT JOIN jobs j ON j.id = e.job_id
        LEFT JOIN job_types jt ON jt.id = j.job_type_id
        WHERE sa.user_id = u.id AND sa.deleted_at IS NULL
          AND ${day}::date BETWEEN e.start_at::date AND e.end_at::date
      ), '[]'::json) AS events
    FROM users u
    WHERE u.deleted_at IS NULL AND u.is_active AND u.role <> 'office'
    ORDER BY u.full_name
  `);
}

export type CrewOption = { id: string; fullName: string; trade: string | null };

export async function getSchedulableCrew(): Promise<CrewOption[]> {
  return rows<CrewOption>(sql`
    SELECT u.id, u.full_name AS "fullName", wp.trade
    FROM users u LEFT JOIN worker_profiles wp ON wp.user_id = u.id
    WHERE u.deleted_at IS NULL AND u.is_active
    ORDER BY u.full_name
  `);
}
