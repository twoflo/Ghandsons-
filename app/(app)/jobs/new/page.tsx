import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJobFormOptions } from "@/modules/jobs/form-data";
import { JobForm } from "@/modules/jobs/job-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New job" };
export const dynamic = "force-dynamic";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "jobs.manage")) redirect("/jobs");

  const { clientId } = await searchParams;
  const options = await getJobFormOptions();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New job"
        subtitle="Start with a name and a client — the money can come later."
        back={{ href: "/jobs", label: "All jobs" }}
      />
      <JobForm
        {...options}
        initial={{
          title: "", clientId: clientId ?? "", siteId: "", jobTypeId: "", status: "lead",
          description: "", notes: "", leadSource: "", startDate: "", endDate: "",
          isPriority: false, contractValueCents: 0, budgetLabourCents: 0,
          budgetMaterialCents: 0, budgetSubcontractorCents: 0, budgetPlantCents: 0,
          budgetOtherCents: 0, crewIds: [],
        }}
      />
    </div>
  );
}
