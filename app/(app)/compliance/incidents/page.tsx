import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listIncidents } from "@/modules/compliance/queries";
import { getJobOptions } from "@/modules/jobs/queries";
import { IncidentList } from "@/modules/compliance/incident-list";
import { PageHeader, StatTile } from "@/components/ui";

export const metadata = { title: "Incident log" };
export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const user = await requireUser();
  const [incidents, jobs] = await Promise.all([listIncidents(), getJobOptions(true)]);

  const open = incidents.filter((i) => i.status !== "closed").length;
  const serious = incidents.filter((i) => ["serious", "notifiable"].includes(i.severity)).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Incident log"
        subtitle="Everything that happened, and what you did about it"
        back={{ href: "/compliance", label: "Compliance" }}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile label="Logged" value={incidents.length} />
        <StatTile label="Still open" value={open} tone={open > 0 ? "warn" : "good"} />
        <StatTile label="Serious or notifiable" value={serious} tone={serious > 0 ? "bad" : "good"} />
      </div>

      <IncidentList
        incidents={incidents}
        jobs={jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, title: j.title }))}
        canCreate={can(user.role, "incidents.create")}
      />
    </div>
  );
}
