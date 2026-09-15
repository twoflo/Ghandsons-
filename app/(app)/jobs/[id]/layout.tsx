import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJob } from "@/modules/jobs/queries";
import { JOB_STATUS, type JobStatus } from "@/lib/status";
import { Badge } from "@/components/ui";
import { JobTabs } from "@/components/job-tabs";
import { JobStatusControl } from "@/modules/jobs/status-control";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  return { title: job ? `${job.jobNumber} — ${job.title}` : "Job" };
}

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const status = JOB_STATUS[job.status as JobStatus];
  const address = [job.siteAddress, job.siteSuburb, job.siteState, job.sitePostcode]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/jobs"
        className="inline-flex min-h-[var(--tap)] items-center gap-1 -ml-1 pr-2 text-sm font-semibold text-ink-600 hover:text-ink-900"
      >
        <span aria-hidden="true">←</span> All jobs
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
              {job.isPriority ? <span aria-label="Priority job">⭐</span> : null}
              {job.jobNumber}
              {job.jobTypeName ? <span className="font-medium normal-case">· {job.jobTypeName}</span> : null}
            </p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
              {job.title}
            </h1>
            <p className="mt-1 text-ink-700">
              <Link href={`/clients/${job.clientId}`} className="font-semibold underline">
                {job.clientName}
              </Link>
              {address ? (
                <>
                  {" · "}
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    className="underline"
                  >
                    {address}
                  </a>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge tone={status.tone} className="text-sm">{status.label}</Badge>
            {can(user.role, "jobs.manage") ? (
              <JobStatusControl jobId={job.id} current={job.status as JobStatus} />
            ) : null}
          </div>
        </div>

        {/* Quick actions the owner reaches for on site. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {job.clientPhone ? (
            <a
              href={`tel:${job.clientPhone.replace(/\s/g, "")}`}
              className="inline-flex min-h-[var(--tap)] items-center gap-1.5 rounded-lg border-2 border-ink-300 bg-white px-3 text-sm font-semibold"
            >
              📞 Call {job.clientName.split(" ")[0]}
            </a>
          ) : null}
          {address ? (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
              className="inline-flex min-h-[var(--tap)] items-center gap-1.5 rounded-lg border-2 border-ink-300 bg-white px-3 text-sm font-semibold"
            >
              🧭 Directions
            </a>
          ) : null}
          <Link
            href={`/receipts/capture?jobId=${job.id}`}
            className="inline-flex min-h-[var(--tap)] items-center gap-1.5 rounded-lg border-2 border-brand-600 bg-brand-600 px-3 text-sm font-semibold text-white"
          >
            📷 Snap a receipt
          </Link>
          <Link
            href={`/jobs/${job.id}/photos?add=1`}
            className="inline-flex min-h-[var(--tap)] items-center gap-1.5 rounded-lg border-2 border-ink-300 bg-white px-3 text-sm font-semibold"
          >
            🖼️ Add a photo
          </Link>
        </div>
      </header>

      <JobTabs jobId={job.id} role={user.role} />

      <div className="mt-4">{children}</div>
    </div>
  );
}
