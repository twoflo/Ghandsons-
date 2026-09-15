import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSchedulableCrew } from "@/modules/schedule/queries";
import { ScheduleEventForm } from "@/modules/schedule/event-form";
import { PageHeader } from "@/components/ui";
import { isoDate } from "@/lib/dates";

export const metadata = { title: "Book something in" };
export const dynamic = "force-dynamic";

export default async function NewScheduleEventPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; day?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "schedule.manage")) redirect("/schedule");

  const [{ jobId, day }, crew] = await Promise.all([searchParams, getSchedulableCrew()]);

  const jobs = (await db.execute(sql`
    SELECT j.id, j.job_number AS "jobNumber", j.title, c.name AS "clientName"
    FROM jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.deleted_at IS NULL AND j.status IN ('won','scheduled','in_progress','complete')
    ORDER BY j.job_number DESC
  `)) as unknown as Array<{ id: string; jobNumber: string; title: string; clientName: string }>;

  /* Pre-tick the job's standing crew — most bookings use the same people. */
  let defaultCrew: string[] = [];
  if (jobId) {
    const assigned = (await db.execute(sql`
      SELECT user_id AS id FROM job_assignments
      WHERE job_id = ${jobId} AND deleted_at IS NULL
    `)) as unknown as Array<{ id: string }>;
    defaultCrew = assigned.map((a) => a.id);
  }

  const start = day ?? isoDate(new Date());

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Book something in"
        subtitle="Work, leave, a delivery — anything that takes up a day."
        back={{ href: "/schedule", label: "Calendar" }}
      />
      <ScheduleEventForm
        jobs={jobs}
        crew={crew}
        initial={{
          jobId: jobId ?? "",
          title: "",
          kind: "work",
          startDate: start,
          endDate: start,
          notes: "",
          userIds: defaultCrew,
        }}
      />
    </div>
  );
}
