import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPendingApprovalWeeks, listTimeEntries } from "@/modules/crew/timesheet-queries";
import { getJobOptions } from "@/modules/jobs/queries";
import { TimesheetWeek } from "@/modules/crew/timesheet-week";
import { PageHeader, Card, EmptyState, LinkButton, Alert } from "@/components/ui";
import { weekDays, isoDate, formatDate } from "@/lib/dates";
import { formatHours, formatMoney } from "@/lib/money";
import { parseISO } from "date-fns";

export const metadata = { title: "Approve timesheets" };
export const dynamic = "force-dynamic";

export default async function ApproveTimesheetsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "time.approve")) redirect("/timesheets");

  const pending = await listPendingApprovalWeeks();
  const jobs = await getJobOptions(true);
  const jobOptions = jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, title: j.title }));

  const totalMinutes = pending.reduce((a, w) => a + w.totalMinutes, 0);
  const totalCost = pending.reduce((a, w) => a + w.totalCostCents, 0);

  const weeks = await Promise.all(
    pending.map(async (week) => ({
      ...week,
      entries: await listTimeEntries({ userId: week.userId, weekStart: week.weekStart }),
      days: weekDays(parseISO(week.weekStart)).map(isoDate),
    })),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Approve timesheets"
        subtitle={
          pending.length
            ? `${pending.length} waiting · ${formatHours(totalMinutes)} · ${formatMoney(totalCost)} of labour`
            : undefined
        }
        back={{ href: "/timesheets", label: "Timesheets" }}
      />

      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon="✅"
            title="Nothing to approve"
            body="Everyone's hours are either still being filled in or already signed off."
            action={<LinkButton href="/timesheets" variant="secondary">Back to timesheets</LinkButton>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <Alert tone="info">
              Approving is what puts these hours onto the jobs as cost. Until you do, they show as
              pending on the job&apos;s budget panel rather than as spend.
            </Alert>
          </div>
          <div className="space-y-5">
            {weeks.map((week) => (
              <div key={`${week.userId}-${week.weekStart}`}>
                <p className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-500">
                  Week of {formatDate(week.weekStart)}
                </p>
                <TimesheetWeek
                  userId={week.userId}
                  userName={week.userName}
                  weekStart={week.weekStart}
                  days={week.days}
                  entries={week.entries}
                  jobs={jobOptions}
                  status="submitted"
                  rejectedReason={null}
                  canApprove
                  canEdit
                  showCost={can(user.role, "crew.viewRates")}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
