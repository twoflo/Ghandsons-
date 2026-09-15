import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listTimeEntries, listTimesheetWeeks } from "@/modules/crew/timesheet-queries";
import { getJobOptions } from "@/modules/jobs/queries";
import { TimesheetWeek } from "@/modules/crew/timesheet-week";
import { PageHeader, Card, EmptyState, StatTile, LinkButton } from "@/components/ui";
import { isoDate, weekStart, weekDays, addDaysIso, formatDate } from "@/lib/dates";
import { formatHours, formatMoney } from "@/lib/money";
import { parseISO } from "date-fns";

export const metadata = { title: "Timesheets" };
export const dynamic = "force-dynamic";

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; user?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const anchor = params.week ? parseISO(params.week) : new Date();
  const monday = isoDate(weekStart(anchor));
  const days = weekDays(anchor).map(isoDate);

  const seesEveryone = can(user.role, "time.viewAll");
  const focusUser = seesEveryone ? params.user : user.id;

  const [weeks, entries, jobs] = await Promise.all([
    listTimesheetWeeks(monday),
    listTimeEntries({ weekStart: monday, userId: focusUser }),
    getJobOptions(),
  ]);

  const visibleWeeks = focusUser ? weeks.filter((w) => w.userId === focusUser) : weeks;

  const totalMinutes = visibleWeeks.reduce((a, w) => a + w.totalMinutes, 0);
  const totalCost = visibleWeeks.reduce((a, w) => a + w.totalCostCents, 0);
  const awaiting = weeks.filter((w) => w.status === "submitted").length;

  const jobOptions = jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, title: j.title }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Timesheets"
        subtitle={`Week of ${formatDate(monday)}`}
        action={
          can(user.role, "time.approve") && awaiting > 0 ? (
            <LinkButton href="/timesheets/approve">{awaiting} to approve</LinkButton>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex overflow-hidden rounded-lg border-2 border-ink-300">
          <Link
            href={`/timesheets?week=${addDaysIso(monday, -7)}${focusUser ? `&user=${focusUser}` : ""}`}
            className="inline-flex min-h-[var(--tap)] items-center bg-white px-3 font-bold text-ink-700 hover:bg-ink-100"
          >
            ← Last week
          </Link>
          <Link
            href="/timesheets"
            className="inline-flex min-h-[var(--tap)] items-center border-x-2 border-ink-300 bg-white px-4 font-bold text-ink-700 hover:bg-ink-100"
          >
            This week
          </Link>
          <Link
            href={`/timesheets?week=${addDaysIso(monday, 7)}${focusUser ? `&user=${focusUser}` : ""}`}
            className="inline-flex min-h-[var(--tap)] items-center bg-white px-3 font-bold text-ink-700 hover:bg-ink-100"
          >
            Next week →
          </Link>
        </div>

        {seesEveryone && focusUser ? (
          <Link
            href={`/timesheets?week=${monday}`}
            className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-bold text-ink-700"
          >
            Show everyone
          </Link>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Hours this week" value={formatHours(totalMinutes)} />
        {can(user.role, "crew.viewRates") ? (
          <StatTile label="Labour cost" value={formatMoney(totalCost)} sub="Approved and pending" />
        ) : null}
        <StatTile
          label="Waiting on approval"
          value={awaiting}
          tone={awaiting > 0 ? "warn" : "good"}
          href={can(user.role, "time.approve") ? "/timesheets/approve" : undefined}
        />
      </div>

      {visibleWeeks.length === 0 ? (
        <Card>
          <EmptyState
            icon="⏱️"
            title="No hours this week"
            body={
              seesEveryone
                ? "Nobody has clocked on or typed anything in yet for this week."
                : "Clock on from the Today screen when you get to site, or add the hours here on the day."
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {visibleWeeks.map((week) => (
            <TimesheetWeek
              key={week.userId}
              userId={week.userId}
              userName={week.userName}
              weekStart={monday}
              days={days}
              entries={entries.filter((e) => e.userId === week.userId)}
              jobs={jobOptions}
              status={week.status}
              rejectedReason={week.rejectedReason}
              canApprove={can(user.role, "time.approve")}
              canEdit={week.userId === user.id || seesEveryone}
              showCost={can(user.role, "crew.viewRates")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
