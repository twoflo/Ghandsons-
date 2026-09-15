import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInvoice, getInvoiceLines, getPayments } from "@/modules/invoices/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, relativeDueLabel } from "@/lib/dates";
import { INVOICE_STATUS, type InvoiceStatus } from "@/lib/status";
import { Card, CardHeader, Badge, PageHeader, LinkButton, Alert, DataList } from "@/components/ui";
import { PaymentPanel } from "@/modules/invoices/payment-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const invoice = await getInvoice((await params).id);
  return { title: invoice ? `${invoice.invoiceNumber} — ${invoice.clientName}` : "Invoice" };
}

const SOURCE_LABEL: Record<string, string> = {
  expense: "Expense on-charged",
  variation: "Variation",
  quote_line: "From the quote",
  time_entry: "Labour",
  deposit: "Deposit",
  progress: "Progress claim",
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [invoice, lines, payments] = await Promise.all([
    getInvoice(id), getInvoiceLines(id), getPayments(id),
  ]);
  if (!invoice) notFound();

  const status = INVOICE_STATUS[invoice.status as InvoiceStatus];
  const overdue = invoice.daysOverdue > 0 && invoice.balanceCents > 0 && invoice.status !== "void";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={overdue ? "bad" : status.tone}>
              {overdue ? `${invoice.daysOverdue} days overdue` : status.label}
            </Badge>
            <Link href={`/clients/${invoice.clientId}`} className="underline">{invoice.clientName}</Link>
            {invoice.jobId ? (
              <Link href={`/jobs/${invoice.jobId}`} className="underline">
                {invoice.jobNumber} — {invoice.jobTitle}
              </Link>
            ) : null}
          </span>
        }
        back={{ href: "/invoices", label: "All invoices" }}
        action={
          can(user.role, "invoices.manage") && invoice.status === "draft" ? (
            <LinkButton href={`/invoices/${invoice.id}/edit`}>Edit</LinkButton>
          ) : undefined
        }
      />

      {invoice.status === "void" ? (
        <div className="mb-4">
          <Alert tone="bad" title="This invoice was voided">
            {invoice.voidReason} — {formatDateTime(invoice.voidedAt)}
          </Alert>
        </div>
      ) : overdue ? (
        <div className="mb-4">
          <Alert tone="bad" title={`${formatMoney(invoice.balanceCents)} is ${invoice.daysOverdue} days overdue`}>
            Due {formatDate(invoice.dueDate)}. Worth a phone call — a reminder email rarely shifts it on its own.
          </Alert>
        </div>
      ) : invoice.status === "draft" ? (
        <div className="mb-4">
          <Alert tone="warn" title="Still a draft">
            The client hasn&apos;t got this yet and it isn&apos;t counted as money owed. Mark it sent when it goes out.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="What's on it"
              subtitle={invoice.type !== "standard" ? `${invoice.type} invoice` : undefined}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">Invoice lines</caption>
                <thead>
                  <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-2">Description</th>
                    <th scope="col" className="px-2 py-2 text-right">Qty</th>
                    <th scope="col" className="px-2 py-2 text-right">Unit</th>
                    <th scope="col" className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {lines.map((line) =>
                    line.isHeading ? (
                      <tr key={line.id} className="bg-ink-100">
                        <th scope="rowgroup" colSpan={4} className="px-4 py-2 text-left font-bold text-ink-800">
                          {line.description}
                        </th>
                      </tr>
                    ) : (
                      <tr key={line.id}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-ink-900">{line.description}</span>
                          {SOURCE_LABEL[line.sourceType] ? (
                            <span className="ml-2 text-xs text-ink-500">{SOURCE_LABEL[line.sourceType]}</span>
                          ) : null}
                          {line.taxRateBp === 0 ? (
                            <span className="ml-2 text-xs font-bold text-info-700">GST free</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-700">
                          {Number(line.quantity) === 1 ? "" : `${Number(line.quantity)} ${line.unit}`}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-700">
                          {formatMoney(line.unitPriceCents)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular font-semibold text-ink-900">
                          {formatMoney(line.lineSubtotalCents)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t-2 border-ink-300 px-4 py-3">
              <dl className="ml-auto max-w-xs space-y-1.5">
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-ink-700">Subtotal</dt>
                  <dd className="tabular font-semibold">{formatMoney(invoice.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-ink-700">GST</dt>
                  <dd className="tabular font-semibold">{formatMoney(invoice.taxCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t-2 border-ink-300 pt-1.5">
                  <dt className="font-bold text-ink-900">Total</dt>
                  <dd className="tabular text-lg font-black">{formatMoney(invoice.totalCents)}</dd>
                </div>
                {invoice.amountPaidCents > 0 ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-good-700">Received</dt>
                      <dd className="tabular font-semibold text-good-700">
                        −{formatMoney(invoice.amountPaidCents)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-ink-300 pt-1.5">
                      <dt className="font-bold text-ink-900">Still owing</dt>
                      <dd className={`tabular text-lg font-black ${invoice.balanceCents > 0 ? "text-bad-700" : "text-good-700"}`}>
                        {formatMoney(invoice.balanceCents)}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </div>
          </Card>

          {invoice.notes ? (
            <Card>
              <CardHeader title="Notes on the invoice" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{invoice.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {can(user.role, "invoices.manage") ? (
            <PaymentPanel
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              status={invoice.status}
              balanceCents={invoice.balanceCents}
              totalCents={invoice.totalCents}
              payments={payments}
              canVoid={can(user.role, "invoices.void")}
            />
          ) : null}

          <Card>
            <CardHeader title="Details" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  { label: "Issued", value: invoice.issueDate ? formatDate(invoice.issueDate) : "Not issued" },
                  {
                    label: "Due",
                    value: invoice.dueDate ? (
                      <span>
                        {formatDate(invoice.dueDate)}
                        <span className={`block text-sm ${overdue ? "text-bad-700" : "text-ink-500"}`}>
                          {relativeDueLabel(invoice.dueDate)}
                        </span>
                      </span>
                    ) : "—",
                  },
                  { label: "Terms", value: `${invoice.paymentTermsDays} days` },
                  ...(invoice.progressPercentBp
                    ? [{ label: "Claim to", value: `${invoice.progressPercentBp / 100}% of contract` }]
                    : []),
                  ...(invoice.previouslyClaimedCents > 0
                    ? [{ label: "Previously claimed", value: formatMoney(invoice.previouslyClaimedCents) }]
                    : []),
                  ...(invoice.sentAt ? [{ label: "Sent", value: formatDateTime(invoice.sentAt) }] : []),
                  ...(invoice.paidAt ? [{ label: "Settled", value: formatDateTime(invoice.paidAt) }] : []),
                  { label: "Raised by", value: invoice.createdByName ?? "—" },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
