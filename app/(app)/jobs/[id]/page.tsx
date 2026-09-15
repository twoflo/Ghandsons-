import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJob, getJobFinancials, getJobCrew, getJobTimeline } from "@/modules/jobs/queries";
import { formatDate, formatDateTime, timeAgo } from "@/lib/dates";
import { Card, CardHeader, DataList, EmptyState, LinkButton, Alert } from "@/components/ui";
import { BudgetPanel } from "@/components/budget-panel";
import { JobNoteForm } from "@/modules/jobs/note-form";

export const dynamic = "force-dynamic";

const TIMELINE_ICON: Record<string, string> = {
  status: "🚩",
  note: "📝",
  invoice: "💰",
  variation: "🔧",
  photo: "📷",
  incident: "⚠️",
};

export default async function JobOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [job, financials, crew, timeline] = await Promise.all([
    getJob(id),
    getJobFinancials(id),
    getJobCrew(id),
    getJobTimeline(id, 25),
  ]);

  if (!job) notFound();

  const showCosts = can(user.role, "jobs.viewCosts");
  const siteWarnings = [
    job.hazardNotes ? { label: "Hazards", body: job.hazardNotes, tone: "bad" as const } : null,
    job.accessNotes ? { label: "Access", body: job.accessNotes, tone: "info" as const } : null,
    job.parkingNotes ? { label: "Parking", body: job.parkingNotes, tone: "info" as const } : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {job.hazardNotes ? (
          <Alert tone="bad" title="Site hazards">{job.hazardNotes}</Alert>
        ) : null}

        {job.description ? (
          <Card>
            <CardHeader title="What we're doing" />
            <p className="whitespace-pre-line px-4 py-3 text-ink-800">{job.description}</p>
          </Card>
        ) : null}

        {showCosts && financials ? (
          <BudgetPanel
            f={financials}
            showMargin={can(user.role, "jobs.viewMargin")}
            isFinished={["complete", "invoiced", "paid"].includes(job.status)}
          />
        ) : null}

        <Card>
          <CardHeader title="What's happened" subtitle="Notes, status changes, money and photos" />
          <div className="border-b border-ink-200 p-4">
            <JobNoteForm jobId={job.id} />
          </div>
          {timeline.length === 0 ? (
            <EmptyState
              icon="🕓"
              title="Nothing recorded yet"
              body="Notes you add here, status changes, invoices and site photos all show up in this list."
            />
          ) : (
            <ol className="divide-y divide-ink-200">
              {timeline.map((event, i) => (
                <li key={`${event.at}-${i}`} className="flex gap-3 px-4 py-3">
                  <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">
                    {TIMELINE_ICON[event.kind] ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">
                      {event.href ? (
                        <Link href={event.href} className="underline">{event.summary}</Link>
                      ) : (
                        event.summary
                      )}
                    </p>
                    {event.detail ? (
                      <p className="mt-0.5 whitespace-pre-line text-sm text-ink-600">{event.detail}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-ink-500">
                      {timeAgo(event.at)}
                      {event.actor ? ` · ${event.actor}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Details"
            action={
              can(user.role, "jobs.manage") ? (
                <LinkButton href={`/jobs/${job.id}/edit`} size="sm" variant="secondary">Edit</LinkButton>
              ) : undefined
            }
          />
          <div className="px-4 py-2">
            <DataList
              rows={[
                { label: "Client", value: <Link href={`/clients/${job.clientId}`} className="font-semibold underline">{job.clientName}</Link> },
                { label: "Site", value: job.siteLabel ?? "—" },
                { label: "Type", value: job.jobTypeName ?? "—" },
                { label: "Planned", value: job.startDate ? `${formatDate(job.startDate)} → ${formatDate(job.endDate)}` : "Not scheduled" },
                ...(job.actualStartDate
                  ? [{ label: "Actually started", value: formatDate(job.actualStartDate) }]
                  : []),
                ...(job.actualEndDate
                  ? [{ label: "Finished", value: formatDate(job.actualEndDate) }]
                  : []),
                ...(job.leadSource ? [{ label: "Came from", value: job.leadSource }] : []),
                ...(job.lostReason ? [{ label: "Why we lost it", value: job.lostReason }] : []),
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Crew"
            subtitle={crew.length ? `${crew.length} on this job` : undefined}
            action={
              can(user.role, "jobs.manage") ? (
                <LinkButton href={`/jobs/${job.id}/edit#crew`} size="sm" variant="secondary">Change</LinkButton>
              ) : undefined
            }
          />
          {crew.length === 0 ? (
            <p className="px-4 py-4 text-ink-600">Nobody assigned yet.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {crew.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{member.fullName}</p>
                    {member.roleOnJob ? (
                      <p className="text-sm capitalize text-ink-600">{member.roleOnJob}</p>
                    ) : null}
                  </div>
                  {member.phone ? (
                    <a
                      href={`tel:${member.phone.replace(/\s/g, "")}`}
                      className="inline-flex min-h-[var(--tap)] items-center rounded-lg px-2 text-sm font-semibold text-info-700 underline"
                    >
                      Call
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {siteWarnings.length > 0 ? (
          <Card>
            <CardHeader title="Getting on site" />
            <div className="space-y-3 px-4 py-3">
              {siteWarnings.map((warning) => (
                <div key={warning!.label}>
                  <p className="text-sm font-bold uppercase tracking-wide text-ink-500">{warning!.label}</p>
                  <p className="text-ink-800">{warning!.body}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {job.notes ? (
          <Card>
            <CardHeader title="Internal notes" subtitle="Not shown to the client" />
            <p className="whitespace-pre-line px-4 py-3 text-ink-800">{job.notes}</p>
          </Card>
        ) : null}

        {job.sourceQuoteId ? (
          <Card>
            <div className="p-4">
              <p className="text-sm text-ink-600">This job came from an accepted quote.</p>
              <LinkButton href={`/quotes/${job.sourceQuoteId}`} size="sm" variant="secondary" className="mt-2">
                View the quote
              </LinkButton>
            </div>
          </Card>
        ) : null}

        <p className="text-xs text-ink-500">Last updated {formatDateTime(new Date())}</p>
      </div>
    </div>
  );
}
