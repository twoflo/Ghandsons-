import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listComplianceItems, getComplianceSummary, getComplianceSubjects, listIncidents,
} from "@/modules/compliance/queries";
import { ComplianceList } from "@/modules/compliance/compliance-list";
import { PageHeader, StatTile, Alert, Card, CardHeader, Badge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { SEVERITIES } from "@/modules/compliance/queries";

export const metadata = { title: "Compliance" };
export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const user = await requireUser();

  const [items, summary, subjects, openIncidents] = await Promise.all([
    listComplianceItems(),
    getComplianceSummary(),
    getComplianceSubjects(),
    listIncidents({ status: "open" }),
  ]);

  const expired = items.filter((i) => i.state === "expired");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Compliance"
        subtitle="Licences, insurance, tickets and the incident log"
        action={
          <Link
            href="/compliance/incidents"
            className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-bold text-ink-700"
          >
            Incident log
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Expired" value={summary.expired} tone={summary.expired > 0 ? "bad" : "good"} />
        <StatTile label="Due soon" value={summary.due} tone={summary.due > 0 ? "warn" : "good"} />
        <StatTile label="Current" value={summary.ok} tone="good" />
        <StatTile
          label="Open incidents"
          value={openIncidents.length}
          tone={openIncidents.length > 0 ? "warn" : "good"}
          href="/compliance/incidents"
        />
      </div>

      {expired.length > 0 ? (
        <div className="mb-5">
          <Alert tone="bad" title={`${expired.length} expired — deal with these today`}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {expired.map((item) => (
                <li key={item.id}>
                  <strong>{item.subjectLabel}</strong> — {item.name}, expired{" "}
                  {formatDate(item.expiryDate)}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              Someone on site without a current ticket is a problem for the whole job, not just them.
            </p>
          </Alert>
        </div>
      ) : null}

      {openIncidents.length > 0 ? (
        <Card className="mb-5">
          <CardHeader title="Incidents still open" subtitle="Not closed out yet" />
          <ul className="divide-y divide-ink-200">
            {openIncidents.map((incident) => {
              const severity = SEVERITIES.find((s) => s.value === incident.severity);
              return (
                <li key={incident.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {incident.incidentNumber}
                      {incident.jobNumber ? ` · ${incident.jobNumber}` : ""}
                    </p>
                    <p className="text-sm text-ink-600">{incident.description}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{formatDate(incident.occurredAt)}</p>
                  </div>
                  <Badge tone={severity?.tone ?? "neutral"}>{severity?.label ?? incident.severity}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <ComplianceList
        items={items}
        workers={subjects.workers}
        suppliers={subjects.suppliers}
        canManage={can(user.role, "compliance.manage")}
      />
    </div>
  );
}
