import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInvoice, getInvoiceLines } from "@/modules/invoices/queries";
import { getInvoiceFormOptions } from "@/modules/invoices/form-data";
import { InvoiceForm } from "@/modules/invoices/invoice-form";
import { PageHeader, Alert } from "@/components/ui";

export const metadata = { title: "Edit invoice" };
export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "invoices.manage")) redirect(`/invoices/${id}`);

  const [invoice, lines, options] = await Promise.all([
    getInvoice(id), getInvoiceLines(id), getInvoiceFormOptions(),
  ]);
  if (!invoice) notFound();

  if (invoice.amountPaidCents > 0 || invoice.status === "void") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={invoice.invoiceNumber} back={{ href: `/invoices/${id}`, label: "Back to the invoice" }} />
        <Alert tone="warn" title="This invoice is locked">
          {invoice.status === "void"
            ? "It has been voided, so it can't be changed."
            : "Money has been received against it. If it's wrong, void it and raise a replacement — that keeps the trail straight for the accountant."}
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${invoice.invoiceNumber}`}
        subtitle={invoice.clientName}
        back={{ href: `/invoices/${id}`, label: "Back to the invoice" }}
      />
      <InvoiceForm
        {...options}
        initial={{
          id: invoice.id,
          clientId: invoice.clientId,
          jobId: invoice.jobId ?? "",
          type: invoice.type as "standard" | "deposit" | "progress" | "final",
          issueDate: invoice.issueDate ?? "",
          paymentTermsDays: invoice.paymentTermsDays,
          reference: invoice.reference ?? "",
          notes: invoice.notes ?? "",
          terms: invoice.terms ?? "",
          lines: lines.map((line) => ({
            key: line.id,
            id: line.id,
            isHeading: line.isHeading === 1,
            sourceType: line.sourceType,
            sourceId: line.sourceId,
            description: line.description,
            quantity: String(Number(line.quantity)),
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            taxRateId: line.taxRateId,
            taxRateBp: line.taxRateBp,
          })),
        }}
      />
    </div>
  );
}
