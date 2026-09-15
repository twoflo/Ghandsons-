import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJob, getJobFinancials } from "@/modules/jobs/queries";
import { listExpenses } from "@/modules/expenses/queries";
import { listInvoices } from "@/modules/invoices/queries";
import { BudgetPanel } from "@/components/budget-panel";
import { Card, CardHeader, LinkButton, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function JobMoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!can(user.role, "jobs.viewCosts")) redirect(`/jobs/${id}`);

  const [job, financials, expenses, invoices] = await Promise.all([
    getJob(id), getJobFinancials(id), listExpenses({ jobId: id, limit: 8 }), listInvoices({ jobId: id }),
  ]);
  if (!job || !financials) notFound();

  const unbilled = await listExpenses({ jobId: id, filter: "unbilled" });

  return (
    <div className="space-y-5">
      <BudgetPanel
        f={financials}
        showMargin={can(user.role, "jobs.viewMargin")}
        isFinished={["complete", "invoiced", "paid"].includes(job.status)}
      />

      {unbilled.length > 0 && can(user.role, "invoices.manage") ? (
        <Card>
          <CardHeader
            title={`${formatMoney(financials.unbilledBillableCents)} you haven't charged on`}
            subtitle={`${unbilled.length} billable expenses sitting on this job`}
            action={<LinkButton href={`/invoices/new?jobId=${id}`} size="sm">Raise a claim</LinkButton>}
          />
          <ul className="divide-y divide-ink-200">
            {unbilled.slice(0, 6).map((expense) => (
              <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{expense.description}</p>
                  <p className="text-sm text-ink-600">
                    {formatDate(expense.expenseDate)} · {expense.supplierName ?? "No supplier"}
                  </p>
                </div>
                <p className="tabular shrink-0 font-bold">{formatMoney(expense.subtotalCents)}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Invoices"
            action={
              can(user.role, "invoices.manage") ? (
                <LinkButton href={`/invoices/new?jobId=${id}`} size="sm" variant="secondary">+ Claim</LinkButton>
              ) : undefined
            }
          />
          {invoices.length === 0 ? (
            <EmptyState icon="💰" title="Nothing invoiced" body="Raise a deposit or a progress claim when you're ready." />
          ) : (
            <ul className="divide-y divide-ink-200">
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link href={`/invoices/${invoice.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-ink-600">
                        {invoice.issueDate ? formatDate(invoice.issueDate) : "Draft"}
                        {invoice.balanceCents > 0 ? ` · ${formatMoney(invoice.balanceCents)} owing` : " · paid"}
                      </p>
                    </div>
                    <p className="tabular shrink-0 font-bold">{formatMoney(invoice.totalCents)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent costs"
            action={<LinkButton href={`/expenses?q=${encodeURIComponent(job.jobNumber)}`} size="sm" variant="secondary">All</LinkButton>}
          />
          {expenses.length === 0 ? (
            <EmptyState icon="💳" title="No costs yet" body="Snap a docket or add one by hand and it'll land here." />
          ) : (
            <ul className="divide-y divide-ink-200">
              {expenses.map((expense) => (
                <li key={expense.id}>
                  <Link href={`/expenses/${expense.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{expense.description}</p>
                      <p className="text-sm text-ink-600">
                        {formatDate(expense.expenseDate)} · {expense.categoryName}
                      </p>
                    </div>
                    <p className="tabular shrink-0 font-bold">{formatMoney(expense.totalCents)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
