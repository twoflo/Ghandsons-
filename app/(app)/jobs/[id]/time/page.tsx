import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listTimeEntries } from "@/modules/crew/timesheet-queries";
import { getJobFinancials } from "@/modules/jobs/queries";
import { formatHours, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { TIME_STATUS, type TimeStatus } from "@/lib/status";
import { Card, CardHeader, Badge, EmptyState, LinkButton, Progress } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobTimePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [entries, financials] = await Promise.all([
    listTimeEntries({ jobId: id }),
    can(user.role, "jobs.viewCosts") ? getJobFinancials(id) : Promise.resolve(null),
  ]);

  const showCost = can(user.role, "crew.viewRates");
  const byPerson = new Map<string, { name: string; minutes: number; cost: number }>();
  for (const entry of entries) {
    if (entry.status !== "approved") continue;
    const current = byPerson.get(entry.userId) ?? { name: entry.userName, minutes: 0, cost: 0 };
    current.minutes += entry.minutes;
    current.cost += entry.costCents;
    byPerson.set(entry.userId, current);
  }

  return (
    <div className="space-y-5">
      {financials ? (
        <Card>
          <CardHeader title="Labour against budget" />
          <div className="p-4">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-ink-700">
                {formatHours(financials.actualLabourMinutes)} approved
                {showCost ? ` · ${formatMoney(financials.actualLabourCents)}` : ""}
              </span>
              {showCost ? (
                <span className="font-bold text-ink-900">of {formatMoney(financials.budgetLabourCents)}</span>
              ) : null}
            </div>
            {showCost ? (
              <Progress
                value={financials.actualLabourCents}
                max={financials.budgetLabourCents || 1}
                tone={
                  financials.actualLabourCents > financials.budgetLabourCents
                    ? "bad"
                    : financials.actualLabourCents / (financials.budgetLabourCents || 1) > 0.85
                      ? "warn"
                      : "good"
                }
                label="Labour against budget"
              />
            ) : null}
            {financials.pendingLabourCents > 0 && showCost ? (
              <p className="mt-2 text-sm text-warn-700">
                Another {formatMoney(financials.pendingLabourCents)} is sitting in timesheets that
                haven&apos;t been approved yet.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {byPerson.size > 0 ? (
        <Card>
          <CardHeader title="Who's worked on it" subtitle="Approved hours only" />
          <ul className="divide-y divide-ink-200">
            {[...byPerson.values()]
              .sort((a, b) => b.minutes - a.minutes)
              .map((person) => (
                <li key={person.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-semibold text-ink-900">{person.name}</span>
                  <span className="flex items-center gap-4">
                    <span className="tabular font-bold">{formatHours(person.minutes)}</span>
                    {showCost ? (
                      <span className="tabular text-ink-600">{formatMoney(person.cost)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Every entry"
          subtitle={`${entries.length} on this job`}
          action={<LinkButton href="/timesheets" size="sm" variant="secondary">Timesheets</LinkButton>}
        />
        {entries.length === 0 ? (
          <EmptyState
            icon="⏱️"
            title="No hours booked yet"
            body="Hours come from clocking on, or from typing them into the timesheet."
          />
        ) : (
          <ul className="divide-y divide-ink-200">
            {entries.map((entry) => {
              const status = TIME_STATUS[entry.status as TimeStatus];
              return (
                <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{entry.userName}</p>
                    <p className="truncate text-sm text-ink-600">
                      {formatDate(entry.workDate)}
                      {entry.description ? ` · ${entry.description}` : ""}
                      {entry.source === "clock" ? " · clocked on" : " · typed in"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-bold">
                      {entry.status === "open" ? "Running" : formatHours(entry.minutes)}
                    </p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {showCost && entry.costCents > 0 ? (
                      <p className="tabular mt-0.5 text-xs text-ink-500">{formatMoney(entry.costCents)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-center text-sm text-ink-500">
        Only approved hours count as cost on this job.{" "}
        <Link href="/timesheets/approve" className="underline">Approve timesheets</Link>
      </p>
    </div>
  );
}
