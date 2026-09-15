import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getExpense, getExpenseLines } from "@/modules/expenses/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LINE_KIND } from "@/lib/status";
import { Card, CardHeader, Badge, PageHeader, LinkButton, DataList, Alert } from "@/components/ui";
import { ArchiveExpenseButton } from "@/modules/expenses/archive-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const expense = await getExpense((await params).id);
  return { title: expense ? expense.description : "Expense" };
}

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [expense, lines] = await Promise.all([getExpense(id), getExpenseLines(id)]);
  if (!expense) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={expense.description}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular text-lg font-black text-ink-900">{formatMoney(expense.totalCents)}</span>
            <span>{formatDate(expense.expenseDate)}</span>
            {expense.categoryKind ? (
              <Badge tone={LINE_KIND[expense.categoryKind]?.tone ?? "neutral"}>
                {expense.categoryName}
              </Badge>
            ) : null}
            {expense.source === "receipt" ? <Badge tone="info">From a photo</Badge> : null}
          </span>
        }
        back={{ href: "/expenses", label: "All expenses" }}
        action={
          can(user.role, "expenses.manage") && !expense.billed ? (
            <div className="flex gap-2">
              <ArchiveExpenseButton expenseId={expense.id} canDelete={can(user.role, "expenses.delete")} />
              <LinkButton href={`/expenses/${expense.id}/edit`}>Edit</LinkButton>
            </div>
          ) : undefined
        }
      />

      {expense.billed ? (
        <div className="mb-4">
          <Alert tone="good" title="Charged on to the client">
            This is on invoice{" "}
            <Link href={`/invoices/${expense.billedInvoiceId}`} className="font-bold underline">
              {expense.billedInvoiceNumber}
            </Link>
            .
          </Alert>
        </div>
      ) : expense.isBillable && expense.jobId ? (
        <div className="mb-4">
          <Alert tone="warn" title="Not charged on yet">
            It&apos;ll come up next time you raise a claim on{" "}
            <Link href={`/jobs/${expense.jobId}/invoices`} className="font-bold underline">
              {expense.jobNumber}
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {expense.receiptFileId ? (
          <Card>
            <CardHeader
              title="The receipt"
              subtitle="Kept forever — the ATO wants five years"
              action={
                <a
                  href={`/api/files/${expense.receiptFileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-info-700 underline"
                >
                  Open full size
                </a>
              }
            />
            <div className="p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${expense.receiptFileId}`}
                alt={`Receipt for ${expense.description}`}
                className="mx-auto w-full max-w-sm rounded-lg border border-ink-200"
              />
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="No receipt attached" />
            <div className="p-4">
              <p className="text-ink-700">
                There&apos;s no photo of the docket on this one. If you still have it, snap it now —
                it&apos;s much easier than finding it at tax time.
              </p>
              <LinkButton href="/receipts/capture" variant="secondary" className="mt-3">
                📷 Snap it
              </LinkButton>
            </div>
          </Card>
        )}

        <div className="space-y-5">
          <Card>
            <CardHeader title="The numbers" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  { label: "Ex GST", value: <span className="tabular">{formatMoney(expense.subtotalCents)}</span> },
                  { label: "GST", value: <span className="tabular">{formatMoney(expense.taxCents)}</span> },
                  {
                    label: "Total",
                    value: <span className="tabular text-lg font-black">{formatMoney(expense.totalCents)}</span>,
                  },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Where it sits" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  {
                    label: "Job",
                    value: expense.jobId ? (
                      <Link href={`/jobs/${expense.jobId}`} className="font-semibold underline">
                        {expense.jobNumber} — {expense.jobTitle}
                      </Link>
                    ) : (
                      "Overhead (no job)"
                    ),
                  },
                  { label: "Supplier", value: expense.supplierName ?? expense.supplierNameRaw ?? "—" },
                  { label: "Category", value: expense.categoryName ?? "—" },
                  { label: "Paid with", value: expense.paymentMethod.replace("_", " ") },
                  ...(expense.reference ? [{ label: "Reference", value: expense.reference }] : []),
                  ...(expense.poNumber
                    ? [{ label: "Purchase order", value: expense.poNumber }]
                    : []),
                  { label: "Charge on to client", value: expense.isBillable ? "Yes" : "No" },
                  { label: "Entered by", value: `${expense.createdByName ?? "—"} · ${formatDateTime(expense.createdAt)}` },
                ]}
              />
            </div>
          </Card>
        </div>

        {lines.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader title="What was on the docket" subtitle={`${lines.length} items`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <caption className="sr-only">Receipt line items</caption>
                <thead>
                  <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-2">Item</th>
                    <th scope="col" className="px-2 py-2 text-right">Qty</th>
                    <th scope="col" className="px-2 py-2 text-right">Each</th>
                    <th scope="col" className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-2 text-ink-900">{line.description}</td>
                      <td className="px-2 py-2 text-right tabular text-ink-700">{Number(line.quantity)}</td>
                      <td className="px-2 py-2 text-right tabular text-ink-700">{formatMoney(line.unitPriceCents)}</td>
                      <td className="px-4 py-2 text-right tabular font-semibold">{formatMoney(line.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {expense.notes ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Notes" />
            <p className="whitespace-pre-line px-4 py-3 text-ink-800">{expense.notes}</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
