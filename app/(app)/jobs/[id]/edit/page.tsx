import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJobFormOptions } from "@/modules/jobs/form-data";
import { getJobCrew } from "@/modules/jobs/queries";
import { JobForm } from "@/modules/jobs/job-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit job" };
export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "jobs.manage")) redirect(`/jobs/${id}`);

  const [[job], options, crew] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, id)).limit(1),
    getJobFormOptions(),
    getJobCrew(id),
  ]);

  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${job.jobNumber}`}
        subtitle={job.title}
        back={{ href: `/jobs/${id}`, label: "Back to the job" }}
      />
      <JobForm
        {...options}
        initial={{
          id: job.id,
          title: job.title,
          clientId: job.clientId,
          siteId: job.siteId ?? "",
          jobTypeId: job.jobTypeId ?? "",
          status: job.status,
          description: job.description ?? "",
          notes: job.notes ?? "",
          leadSource: job.leadSource ?? "",
          startDate: job.startDate ?? "",
          endDate: job.endDate ?? "",
          isPriority: job.isPriority,
          contractValueCents: job.contractValueCents,
          budgetLabourCents: job.budgetLabourCents,
          budgetMaterialCents: job.budgetMaterialCents,
          budgetSubcontractorCents: job.budgetSubcontractorCents,
          budgetPlantCents: job.budgetPlantCents,
          budgetOtherCents: job.budgetOtherCents,
          crewIds: crew.map((c) => c.userId),
        }}
      />
    </div>
  );
}
