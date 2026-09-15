import Link from "next/link";
import { Badge, Progress } from "@/components/ui";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";
import { JOB_STATUS, type JobStatus } from "@/lib/status";
import type { JobListItem } from "@/modules/jobs/queries";

export function JobCard({ job, showMoney }: { job: JobListItem; showMoney: boolean }) {
  const status = JOB_STATUS[job.status as JobStatus];
  const over = job.budgetVarianceCents > 0;

  return (
    <li className="card">
      <Link href={`/jobs/${job.id}`} className="block p-4 hover:bg-ink-50 active:bg-ink-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
              {job.isPriority ? <span title="Priority" aria-label="Priority">⭐</span> : null}
              {job.jobNumber}
              {job.jobTypeName ? (
                <span className="inline-flex items-center gap-1 normal-case text-ink-500">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: job.jobTypeColour ?? "#94a3b8" }}
                    aria-hidden="true"
                  />
                  {job.jobTypeName}
                </span>
              ) : null}
            </p>
            <h3 className="mt-0.5 font-bold text-ink-900">{job.title}</h3>
            <p className="truncate text-sm text-ink-600">
              {job.clientName}
              {job.siteSuburb ? ` · ${job.siteSuburb}` : ""}
            </p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
          {job.startDate ? (
            <span>
              📅 {formatDateShort(job.startDate)}
              {job.endDate ? ` – ${formatDateShort(job.endDate)}` : ""}
            </span>
          ) : (
            <span className="text-ink-400">No dates set</span>
          )}
          {job.crew.length ? <span>👷 {job.crew.length}</span> : null}
          {showMoney && job.outstandingCents > 0 ? (
            <span className="font-semibold text-bad-700">{formatMoney(job.outstandingCents)} owing</span>
          ) : null}
        </div>

        {showMoney && job.revisedBudgetCents > 0 ? (
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold text-ink-600">
                {formatMoneyShort(job.actualTotalCents)} of {formatMoneyShort(job.revisedBudgetCents)} budget
              </span>
              {over ? (
                <span className="font-bold text-bad-700">
                  {formatMoneyShort(job.budgetVarianceCents)} over
                </span>
              ) : (
                <span className="text-ink-500">
                  {Math.round((job.actualTotalCents / job.revisedBudgetCents) * 100)}%
                </span>
              )}
            </div>
            <Progress
              value={job.actualTotalCents}
              max={job.revisedBudgetCents}
              tone={over ? "bad" : job.actualTotalCents / job.revisedBudgetCents > 0.85 ? "warn" : "good"}
              label={`${job.jobNumber} spend against budget`}
            />
          </div>
        ) : null}
      </Link>
    </li>
  );
}
