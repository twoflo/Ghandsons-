"use client";

import { useState } from "react";
import Link from "next/link";
import { IncidentForm } from "./incident-form";
import { SEVERITIES } from "./constants";
import type { IncidentRow } from "./queries";
import { Button, Card, CardHeader, Badge, EmptyState } from "@/components/ui";
import { formatDateTime, formatDate } from "@/lib/dates";

export function IncidentList({
  incidents,
  jobs,
  canCreate,
}: {
  incidents: IncidentRow[];
  jobs: Array<{ id: string; jobNumber: string; title: string }>;
  canCreate: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="space-y-4">
      {canCreate && editing !== "new" ? (
        <Button onClick={() => setEditing("new")}>+ Log an incident</Button>
      ) : null}

      {editing === "new" ? <IncidentForm jobs={jobs} onDone={() => setEditing(null)} /> : null}

      {incidents.length === 0 && editing !== "new" ? (
        <Card>
          <EmptyState
            icon="🛡️"
            title="Nothing logged"
            body="Log near misses too — a bundle of battens sliding off an edge with nobody under it is the warning you get before someone is."
          />
        </Card>
      ) : null}

      <ul className="space-y-3">
        {incidents.map((incident) => {
          if (editing === incident.id) {
            return (
              <li key={incident.id}>
                <IncidentForm incident={incident} jobs={jobs} onDone={() => setEditing(null)} />
              </li>
            );
          }
          const severity = SEVERITIES.find((s) => s.value === incident.severity);
          return (
            <li key={incident.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    {incident.incidentNumber}
                    {incident.jobNumber ? ` · ${incident.jobNumber}` : ""}
                  </p>
                  <p className="font-bold text-ink-900">{formatDateTime(incident.occurredAt)}</p>
                  {incident.personInvolved ? (
                    <p className="text-sm text-ink-600">{incident.personInvolved}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={severity?.tone ?? "neutral"}>{severity?.label ?? incident.severity}</Badge>
                  <Badge tone={incident.status === "closed" ? "good" : "warn"}>
                    {incident.status === "closed" ? "Closed" : incident.status === "investigating" ? "Looking into it" : "Open"}
                  </Badge>
                </div>
              </div>

              <p className="mt-2 whitespace-pre-line text-ink-800">{incident.description}</p>

              {incident.immediateAction ? (
                <p className="mt-2 text-sm">
                  <span className="font-bold text-ink-700">Straight away: </span>
                  <span className="text-ink-700">{incident.immediateAction}</span>
                </p>
              ) : null}
              {incident.correctiveAction ? (
                <p className="mt-1 text-sm">
                  <span className="font-bold text-ink-700">Since: </span>
                  <span className="text-ink-700">{incident.correctiveAction}</span>
                </p>
              ) : null}

              {incident.reportedToAuthority ? (
                <p className="mt-2 text-sm font-semibold text-info-700">
                  Reported to the regulator
                  {incident.authorityReference ? ` · ref ${incident.authorityReference}` : ""}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-2 text-sm">
                <span className="text-ink-500">
                  Reported by {incident.reportedByName ?? "—"}
                  {incident.closedAt ? ` · closed ${formatDate(incident.closedAt)}` : ""}
                </span>
                {incident.jobId ? (
                  <Link href={`/jobs/${incident.jobId}`} className="font-semibold text-info-700 underline">
                    Open the job
                  </Link>
                ) : null}
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => setEditing(incident.id)}
                    className="ml-auto font-semibold text-ink-600 underline"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
