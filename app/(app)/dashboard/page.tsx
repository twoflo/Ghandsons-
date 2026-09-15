import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getTodaysWork, getWeekLoad, getMoneySnapshot, getBudgetRisks, getUpcomingExpiries,
  getReceiptQueueSummary, getPipeline, getClockedOn, getPendingApprovals, getMyDay,
} from "@/modules/dashboard/queries";
import { formatMoney, formatMoneyShort, formatHours } from "@/lib/money";
import { formatDate, formatDayLabel, weekDays, isoDate } from "@/lib/dates";
import { JOB_STATUS, type JobStatus } from "@/lib/status";
import { Card, CardHeader, StatTile, Badge, EmptyState, LinkButton, Progress } from "@/components/ui";
import { ClockWidget } from "@/modules/crew/clock-widget";
import { getOpenEntry, getJobsForClockOn } from "@/modules/crew/queries";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const isField = user.role === "field";

  const [todaysWork, openEntry, clockJobs] = await Promise.all([
    getTodaysWork(isField ? user.id : undefined),
    getOpenEntry(user.id),
    getJobsForClockOn(isField ? user.id : undefined),
  ]);

  const greeting = new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening";
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-ink-600">{formatDate(new Date())}</p>
      </header>

      {/* Clock on/off is the single most-used control on site. Top of the page. */}
      <ClockWidget openEntry={openEntry} jobs={clockJobs} />

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="mb-2 text-lg font-bold text-ink-800">
          {isField ? "Where you're on today" : "On site today"}
        </h2>
        {todaysWork.length === 0 ? (
          <Card>
            <EmptyState
              icon="🌤️"
              title="Nothing booked in for today"
              body={
                isField
                  ? "You're not scheduled on a job today. If you're on site anyway, clock on above and pick the job."
                  : "No jobs are scheduled today. Open the schedule to drag one onto the calendar."
              }
              action={can(user.role, "schedule.manage") ? <LinkButton href="/schedule">Open the schedule</LinkButton> : undefined}
            />
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {todaysWork.map((item) => {
              const status = item.status ? JOB_STATUS[item.status as JobStatus] : null;
              return (
                <Card as="li" key={item.eventId} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {item.jobNumber ? (
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{item.jobNumber}</p>
                      ) : null}
                      <h3 className="font-bold text-ink-900">{item.title}</h3>
                      <p className="text-sm text-ink-600">{item.clientName ?? "No client"}</p>
                    </div>
                    {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                  </div>

                  {item.addressLine1 ? (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${item.addressLine1} ${item.suburb ?? ""}`)}`}
                      className="mt-2 inline-flex min-h-[var(--tap)] items-center gap-1.5 text-sm font-semibold text-info-700 underline"
                    >
                      📍 {item.addressLine1}, {item.suburb}
                    </a>
                  ) : null}

                  {item.crew.length ? (
                    <p className="mt-1 text-sm text-ink-600">
                      <span className="font-semibold">Crew:</span> {item.crew.join(", ")}
                    </p>
                  ) : null}

                  {item.notes ? (
                    <p className="mt-2 rounded-md bg-warn-50 px-3 py-2 text-sm text-warn-700">{item.notes}</p>
                  ) : null}

                  {item.jobId ? (
                    <div className="mt-3">
                      <LinkButton href={`/jobs/${item.jobId}`} variant="secondary" size="sm">
                        Open job
                      </LinkButton>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      {isField ? <FieldExtras userId={user.id} /> : <OwnerDashboard role={user.role} />}
    </div>
  );
}

/* ------------------------------ field worker ------------------------------ */

async function FieldExtras({ userId }: { userId: string }) {
  const entries = await getMyDay(userId);
  const total = entries.reduce((a, e) => a + e.minutes, 0);

  return (
    <section aria-labelledby="myday-heading">
      <h2 id="myday-heading" className="mb-2 text-lg font-bold text-ink-800">
        Your hours today
      </h2>
      <Card>
        {entries.length === 0 ? (
          <EmptyState
            icon="⏱️"
            title="No hours logged today"
            body="Clock on above when you get to site, or add the hours by hand this evening."
            action={<LinkButton href="/timesheets" variant="secondary">Go to timesheets</LinkButton>}
          />
        ) : (
          <>
            <ul className="divide-y divide-ink-200">
              {entries.map((entry) => (
                <li key={entry.entryId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{entry.jobTitle ?? "No job"}</p>
                    <p className="text-sm text-ink-600">{entry.description ?? entry.jobNumber}</p>
                  </div>
                  <p className="tabular font-bold text-ink-900">
                    {entry.status === "open" ? "Running" : formatHours(entry.minutes)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t-2 border-ink-300 px-4 py-3">
              <p className="font-bold text-ink-800">Total today</p>
              <p className="tabular text-lg font-black">{formatHours(total)}</p>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

/* --------------------------- owner / office view --------------------------- */

async function OwnerDashboard({ role }: { role: string }) {
  const [money, risks, expiries, receipts, pipeline, clockedOn, approvals, week] =
    await Promise.all([
      getMoneySnapshot(), getBudgetRisks(), getUpcomingExpiries(), getReceiptQueueSummary(),
      getPipeline(), getClockedOn(), getPendingApprovals(), getWeekLoad(),
    ]);

  const canSeeMoney = can(role as never, "invoices.view");
  const pipelineByStatus = new Map(pipeline.map((p) => [p.status, p]));
  const openValue = (["lead", "quoted", "won"] as const).reduce(
    (a, s) => a + (pipelineByStatus.get(s)?.valueCents ?? 0), 0,
  );

  return (
    <>
      {canSeeMoney ? (
        <section aria-labelledby="money-heading">
          <h2 id="money-heading" className="mb-2 text-lg font-bold text-ink-800">Money</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Owed to you"
              value={formatMoney(money.outstandingCents)}
              sub={money.overdueCount > 0 ? `${formatMoney(money.overdueCents)} of it is overdue` : "Nothing overdue"}
              tone={money.overdueCents > 0 ? "bad" : "good"}
              href="/invoices?filter=unpaid"
            />
            <StatTile
              label="Banked last 30 days"
              value={formatMoney(money.paidLast30Cents)}
              sub="Payments received"
              tone="good"
              href="/reports/cash"
            />
            <StatTile
              label="Due in the next 7 days"
              value={formatMoney(money.dueThisWeekCents)}
              sub={money.draftCount > 0 ? `${money.draftCount} invoice${money.draftCount === 1 ? "" : "s"} still in draft` : "No drafts waiting"}
              tone={money.draftCount > 0 ? "warn" : "neutral"}
              href="/invoices"
            />
            <StatTile
              label="Costs not billed on"
              value={formatMoney(money.unbilledBillableCents)}
              sub="Billable expenses sitting on jobs"
              tone={money.unbilledBillableCents > 0 ? "warn" : "neutral"}
              href="/expenses?filter=unbilled"
            />
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------ receipts ------------------------------ */}
        <Card>
          <CardHeader
            title="Receipts to check"
            subtitle="Photographed on site, read automatically, waiting on you"
            action={<LinkButton href="/receipts" size="sm" variant="secondary">Open queue</LinkButton>}
          />
          <div className="p-4">
            {receipts.needsReview === 0 && receipts.processing === 0 && receipts.failed === 0 ? (
              <p className="text-ink-600">All clear — nothing waiting.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-3xl font-black tabular text-ink-900">{receipts.needsReview}</p>
                  <p className="text-sm font-semibold text-ink-600">need checking</p>
                </div>
                {receipts.processing > 0 ? (
                  <Badge tone="info">{receipts.processing} still reading</Badge>
                ) : null}
                {receipts.failed > 0 ? (
                  <Badge tone="bad">{receipts.failed} couldn&apos;t be read</Badge>
                ) : null}
              </div>
            )}
          </div>
        </Card>

        {/* ------------------------------- approvals ---------------------------- */}
        <Card>
          <CardHeader title="Waiting on you" subtitle="Nothing moves until these are signed off" />
          {approvals.length === 0 ? (
            <p className="px-4 py-5 text-ink-600">Nothing waiting for approval.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {approvals.slice(0, 5).map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{item.label}</p>
                      <p className="truncate text-sm text-ink-600">{item.detail}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {item.amountCents !== null ? (
                        <p className="tabular font-bold">{formatMoney(item.amountCents)}</p>
                      ) : null}
                      <p className={`text-xs font-semibold ${item.ageDays > 7 ? "text-bad-700" : "text-ink-500"}`}>
                        {item.ageDays} day{item.ageDays === 1 ? "" : "s"} old
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ----------------------------- budget risks --------------------------- */}
        <Card>
          <CardHeader
            title="Jobs to watch"
            subtitle="Over budget, or heading that way once committed costs land"
          />
          {risks.length === 0 ? (
            <p className="px-4 py-5 text-ink-600">Every job is inside its budget. Good week.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {risks.map((job) => {
                const over = job.budgetVarianceCents > 0;
                return (
                  <li key={job.jobId}>
                    <Link href={`/jobs/${job.jobId}`} className="block px-4 py-3 hover:bg-ink-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">
                            {job.jobNumber} — {job.title}
                          </p>
                          <p className="truncate text-sm text-ink-600">{job.clientName}</p>
                        </div>
                        <Badge tone={over ? "bad" : "warn"}>
                          {over ? "Over" : "Forecast over"}{" "}
                          {formatMoneyShort(Math.abs(over ? job.budgetVarianceCents : job.forecastVarianceCents))}
                        </Badge>
                      </div>
                      <div className="mt-2">
                        <Progress
                          value={job.actualTotalCents}
                          max={job.revisedBudgetCents}
                          tone={over ? "bad" : "warn"}
                          label={`${job.jobNumber} spend against budget`}
                        />
                        <p className="mt-1 text-xs text-ink-500 tabular">
                          {formatMoney(job.actualTotalCents)} spent of {formatMoney(job.revisedBudgetCents)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ------------------------------- expiries ----------------------------- */}
        <Card>
          <CardHeader
            title="Licences & insurance"
            subtitle="Expired or expiring in the next 60 days"
            action={<LinkButton href="/compliance" size="sm" variant="secondary">All records</LinkButton>}
          />
          {expiries.length === 0 ? (
            <p className="px-4 py-5 text-ink-600">Nothing expiring soon.</p>
          ) : (
            <ul className="divide-y divide-ink-200">
              {expiries.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{item.name}</p>
                    <p className="truncate text-sm text-ink-600">{item.subjectLabel}</p>
                  </div>
                  <Badge tone={item.daysLeft < 0 ? "bad" : item.daysLeft <= 14 ? "warn" : "neutral"}>
                    {item.daysLeft < 0
                      ? `Expired ${Math.abs(item.daysLeft)}d ago`
                      : item.daysLeft === 0
                        ? "Expires today"
                        : `${item.daysLeft} days`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* --------------------------------- week -------------------------------- */}
      <section aria-labelledby="week-heading">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="week-heading" className="text-lg font-bold text-ink-800">This week</h2>
          <Link href="/schedule" className="text-sm font-semibold text-info-700 underline">
            Open schedule
          </Link>
        </div>
        <Card className="overflow-x-auto">
          <div className="grid min-w-[42rem] grid-cols-7 divide-x divide-ink-200">
            {weekDays().map((day) => {
              const iso = isoDate(day);
              const load = week.find((w) => w.day === iso);
              const isToday = iso === isoDate(new Date());
              return (
                <div key={iso} className={`p-3 ${isToday ? "bg-brand-50" : ""}`}>
                  <p className={`text-xs font-bold uppercase ${isToday ? "text-brand-700" : "text-ink-500"}`}>
                    {formatDayLabel(day)}
                  </p>
                  <p className="mt-1 text-2xl font-black tabular text-ink-900">{load?.jobCount ?? 0}</p>
                  <p className="text-xs text-ink-500">
                    {load?.jobCount === 1 ? "job" : "jobs"} · {load?.crewCount ?? 0} on
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* ------------------------------- clocked on ---------------------------- */}
      {clockedOn.length > 0 ? (
        <Card>
          <CardHeader title="Clocked on right now" subtitle={`${clockedOn.length} on the tools`} />
          <ul className="divide-y divide-ink-200">
            {clockedOn.map((entry) => (
              <li key={entry.entryId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{entry.fullName}</p>
                  <p className="truncate text-sm text-ink-600">
                    {entry.jobNumber ? `${entry.jobNumber} — ${entry.jobTitle}` : "No job selected"}
                  </p>
                </div>
                <Badge tone="brand">{formatHours(entry.minutesSoFar)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* -------------------------------- pipeline ----------------------------- */}
      <section aria-labelledby="pipeline-heading">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="pipeline-heading" className="text-lg font-bold text-ink-800">Pipeline</h2>
          {canSeeMoney ? (
            <p className="text-sm text-ink-600">
              <span className="font-bold tabular">{formatMoney(openValue)}</span> not yet won
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {(["lead", "quoted", "won", "scheduled", "in_progress", "complete", "invoiced", "paid"] as JobStatus[]).map(
            (status) => {
              const entry = pipelineByStatus.get(status);
              return (
                <Link
                  key={status}
                  href={`/jobs?status=${status}`}
                  className="card px-3 py-2.5 hover:bg-ink-50"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    {JOB_STATUS[status].label}
                  </p>
                  <p className="mt-0.5 text-xl font-black tabular text-ink-900">{entry?.jobCount ?? 0}</p>
                  {canSeeMoney && entry?.valueCents ? (
                    <p className="text-xs text-ink-500 tabular">{formatMoneyShort(entry.valueCents)}</p>
                  ) : null}
                </Link>
              );
            },
          )}
        </div>
      </section>
    </>
  );
}
