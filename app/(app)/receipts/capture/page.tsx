import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJobOptions } from "@/modules/jobs/queries";
import { ReceiptCapture } from "@/modules/receipts/capture";
import { PageHeader, Card } from "@/components/ui";

export const metadata = { title: "Snap a receipt" };
export const dynamic = "force-dynamic";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "receipts.upload")) redirect("/dashboard");

  const [{ jobId }, jobs] = await Promise.all([searchParams, getJobOptions()]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Snap a receipt"
        subtitle="One or a whole handful. They get read while you get on with it."
        back={{ href: "/receipts", label: "Receipt queue" }}
      />

      <ReceiptCapture
        defaultJobId={jobId}
        jobs={jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, title: j.title }))}
      />

      <Card className="mt-5">
        <div className="p-4 text-sm text-ink-700">
          <p className="font-bold text-ink-900">Getting a good photo</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Flatten the docket out — a crease through the total is the main thing that trips it up.</li>
            <li>Get the whole thing in frame, including the total at the bottom.</li>
            <li>Shade it with your hand if the sun&apos;s on it. Glare reads worse than shadow.</li>
            <li>Straight down, not at an angle.</li>
          </ul>
          <p className="mt-3">
            Photos are shrunk on your phone before they&apos;re sent, so this works on a bar of signal.
            If one fails, it stays on screen with a Try again — nothing gets lost.
          </p>
        </div>
      </Card>
    </div>
  );
}
