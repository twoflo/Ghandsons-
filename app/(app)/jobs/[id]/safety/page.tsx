import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSafetyDocs, listIncidents, SEVERITIES } from "@/modules/compliance/queries";
import { getJob } from "@/modules/jobs/queries";
import { SafetyPanel } from "@/modules/compliance/safety-panel";
import { Card, CardHeader, Badge, Alert, EmptyState, LinkButton } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function JobSafetyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [job, docs, incidents] = await Promise.all([
    getJob(id),
    listSafetyDocs(id),
    listIncidents({ jobId: id }),
  ]);

  return (
    <div className="space-y-5">
      {job?.hazardNotes ? (
        <Alert tone="bad" title="Site hazards">{job.hazardNotes}</Alert>
      ) : null}

      <SafetyPanel
        jobId={id}
        docs={docs}
        currentUserName={user.fullName}
        canManage={can(user.role, "compliance.manage")}
      />

      <Card>
        <CardHeader
          title="Incidents on this job"
          subtitle={incidents.length ? `${incidents.length} logged` : undefined}
          action={<LinkButton href="/compliance/incidents" size="sm" variant="secondary">Full log</LinkButton>}
        />
        {incidents.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Nothing's happened"
            body="Log near misses as well as injuries — they're the warning you get before something serious."
          />
        ) : (
          <ul className="divide-y divide-ink-200">
            {incidents.map((incident) => {
              const severity = SEVERITIES.find((s) => s.value === incident.severity);
              return (
                <li key={incident.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">
                        {incident.incidentNumber} · {formatDateTime(incident.occurredAt)}
                      </p>
                      <p className="text-sm text-ink-700">{incident.description}</p>
                      {incident.correctiveAction ? (
                        <p className="mt-1 text-sm text-ink-600">
                          <span className="font-bold">Since: </span>
                          {incident.correctiveAction}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={severity?.tone ?? "neutral"}>{severity?.label}</Badge>
                      <Badge tone={incident.status === "closed" ? "good" : "warn"}>
                        {incident.status === "closed" ? "Closed" : "Open"}
                      </Badge>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-ink-200 px-4 py-3">
          <Link href="/compliance/incidents" className="font-semibold text-info-700 underline">
            Log something that happened on this job
          </Link>
        </div>
      </Card>
    </div>
  );
}
