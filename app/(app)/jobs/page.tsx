import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listJobs } from "@/modules/jobs/queries";
import { JOB_STATUS, JOB_STATUS_FLOW, type JobStatus } from "@/lib/status";
import { PageHeader, Card, EmptyState, LinkButton, Input } from "@/components/ui";
import { JobCard } from "@/components/job-card";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const FILTER_TABS: Array<{ key: string; label: string; statuses?: JobStatus[] }> = [
  { key: "live", label: "Live", statuses: ["won", "scheduled", "in_progress"] },
  { key: "pipeline", label: "Pipeline", statuses: ["lead", "quoted"] },
  { key: "finishing", label: "Finishing up", statuses: ["complete", "invoiced"] },
  { key: "all", label: "All" },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string; q?: string; mine?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const showMoney = can(user.role, "jobs.viewCosts");
  const canSeeAll = can(user.role, "jobs.viewAll");

  const tab = params.tab ?? (params.status ? "all" : "live");
  const tabConfig = FILTER_TABS.find((t) => t.key === tab);

  const statuses = params.status
    ? [params.status]
    : tabConfig?.statuses ?? undefined;

  const jobs = await listJobs({
    status: statuses,
    search: params.q,
    // Field workers only ever see jobs they're on.
    assignedTo: canSeeAll ? (params.mine === "1" ? user.id : undefined) : user.id,
  });

  const activeStatusLabel = params.status
    ? JOB_STATUS[params.status as JobStatus]?.label
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Jobs"
        subtitle={`${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}${activeStatusLabel ? ` · ${activeStatusLabel}` : ""}`}
        action={
          can(user.role, "jobs.manage") ? (
            <LinkButton href="/jobs/new">+ New job</LinkButton>
          ) : undefined
        }
      />

      <form method="get" className="mb-3">
        {tab !== "live" ? <input type="hidden" name="tab" value={tab} /> : null}
        {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search job, client, address…"
          aria-label="Search jobs"
          enterKeyHint="search"
        />
      </form>

      {canSeeAll ? (
        <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter jobs">
          {FILTER_TABS.map((t) => {
            const active = t.key === tab && !params.status;
            return (
              <Link
                key={t.key}
                href={t.key === "live" ? "/jobs" : `/jobs?tab=${t.key}`}
                className={`inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-300 bg-white text-ink-700"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
          {params.status ? (
            <Link
              href="/jobs"
              className="inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 border-brand-600 bg-brand-600 px-4 text-sm font-bold text-white"
            >
              {activeStatusLabel} ✕
            </Link>
          ) : null}
        </nav>
      ) : null}

      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔨"
            title={params.q ? "Nothing matched that search" : "No jobs here yet"}
            body={
              params.q
                ? "Try a shorter search — part of the client's name or the street usually does it."
                : canSeeAll
                  ? "Start with a lead. You can add the quote and the budget later."
                  : "You're not on any jobs at the moment. Your supervisor will book you in."
            }
            action={
              params.q ? (
                <LinkButton href="/jobs" variant="secondary">Clear search</LinkButton>
              ) : can(user.role, "jobs.manage") ? (
                <LinkButton href="/jobs/new">+ New job</LinkButton>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} showMoney={showMoney} />
          ))}
        </ul>
      )}

      {!params.status && canSeeAll ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">
            Jump to a stage
          </h2>
          <div className="flex flex-wrap gap-2">
            {JOB_STATUS_FLOW.map((status) => (
              <Link
                key={status}
                href={`/jobs?status=${status}`}
                className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100"
              >
                {JOB_STATUS[status].label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
