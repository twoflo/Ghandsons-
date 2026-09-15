import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getQuote, getQuoteLines } from "@/modules/quotes/queries";
import { getQuoteFormOptions } from "@/modules/quotes/form-data";
import { QuoteForm } from "@/modules/quotes/quote-form";
import { PageHeader, Alert } from "@/components/ui";

export const metadata = { title: "Edit quote" };
export const dynamic = "force-dynamic";

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "quotes.manage")) redirect(`/quotes/${id}`);

  const [quote, lines, options] = await Promise.all([
    getQuote(id), getQuoteLines(id), getQuoteFormOptions(),
  ]);
  if (!quote) notFound();

  if (quote.status === "accepted") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={quote.quoteNumber} back={{ href: `/quotes/${id}`, label: "Back to the quote" }} />
        <Alert tone="warn" title="Accepted quotes are locked">
          This quote has been accepted, and the job&apos;s budget is built from it. To change the price,
          raise a variation on the job, or start a revision from the quote page.
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${quote.quoteNumber}`}
        subtitle={quote.title}
        back={{ href: `/quotes/${id}`, label: "Back to the quote" }}
      />
      <QuoteForm
        {...options}
        showCost={can(user.role, "jobs.viewMargin")}
        initial={{
          id: quote.id,
          clientId: quote.clientId,
          siteId: quote.siteId ?? "",
          jobId: quote.jobId ?? "",
          title: quote.title,
          issueDate: quote.issueDate ?? "",
          validUntil: quote.validUntil ?? "",
          globalMarkupBp: quote.globalMarkupBp,
          scopeOfWork: quote.scopeOfWork ?? "",
          exclusions: quote.exclusions ?? "",
          terms: quote.terms ?? "",
          internalNotes: quote.internalNotes ?? "",
          lines: lines.map((line) => ({
            key: line.id,
            id: line.id,
            sortOrder: line.sortOrder,
            isHeading: line.isHeading === 1,
            kind: line.kind as "labour" | "material" | "subcontractor" | "plant" | "other",
            description: line.description,
            quantity: String(Number(line.quantity)),
            unit: line.unit,
            unitCostCents: line.unitCostCents,
            markupBp: line.markupBp,
            taxRateId: line.taxRateId,
            taxRateBp: line.taxRateBp,
            priceBookItemId: line.priceBookItemId,
            notes: line.notes,
          })),
        }}
      />
    </div>
  );
}
