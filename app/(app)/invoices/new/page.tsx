import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getInvoiceFormOptions } from "@/modules/invoices/form-data";
import { getJobClaimContext, getBillableExpenses, getBillableVariations } from "@/modules/invoices/queries";
import { InvoiceForm } from "@/modules/invoices/invoice-form";
import { blankInvoiceLine } from "@/modules/invoices/editor-line";
import { ClaimBuilder } from "@/modules/invoices/claim-builder";
import { PageHeader, Card, LinkButton } from "@/components/ui";
import { isoDate } from "@/lib/dates";

export const metadata = { title: "New invoice" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; clientId?: string; mode?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "invoices.manage")) redirect("/invoices");

  const [params, settings] = await Promise.all([searchParams, getSettings()]);

  /* Coming from a job, the claim builder is almost always what's wanted:
   * a percentage of the contract plus the extras. "Blank invoice" is there
   * for the odd one-off. */
  if (params.jobId && params.mode !== "manual") {
    const [job, expenses, variations] = await Promise.all([
      getJobClaimContext(params.jobId),
      getBillableExpenses(params.jobId),
      getBillableVariations(params.jobId),
    ]);

    if (job) {
      return (
        <div className="mx-auto max-w-3xl">
          <PageHeader
            title="Raise a claim"
            subtitle="Percentage of the contract, plus anything else you're owed."
            back={{ href: `/jobs/${params.jobId}/invoices`, label: "Back to the job" }}
            action={
              <LinkButton href={`/invoices/new?jobId=${params.jobId}&mode=manual`} variant="secondary">
                Blank invoice instead
              </LinkButton>
            }
          />
          <ClaimBuilder
            job={job}
            expenses={expenses}
            variations={variations}
            defaultTermsDays={settings.defaultPaymentTermsDays}
            defaultMarkupBp={settings.defaultMarkupBp}
          />
        </div>
      );
    }
  }

  const options = await getInvoiceFormOptions();
  const rate = options.taxRates.find((r) => r.rateBp > 0) ?? options.taxRates[0];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New invoice"
        subtitle="Built from scratch. It saves as a draft until you send it."
        back={{ href: "/invoices", label: "All invoices" }}
      />
      {!params.jobId ? (
        <Card className="mb-4 p-4">
          <p className="text-sm text-ink-700">
            Invoicing against a job? Open the job and use{" "}
            <strong>Raise a claim</strong> — it works out the percentage and pulls in your
            variations and on-charged costs automatically.
          </p>
        </Card>
      ) : null}
      <InvoiceForm
        {...options}
        initial={{
          clientId: params.clientId ?? "",
          jobId: params.jobId ?? "",
          type: "standard",
          issueDate: isoDate(new Date()),
          paymentTermsDays: settings.defaultPaymentTermsDays,
          reference: "",
          notes: "",
          terms: settings.invoiceFooter ?? "",
          lines: [blankInvoiceLine(rate?.id ?? null, rate?.rateBp ?? 0)],
        }}
      />
    </div>
  );
}
