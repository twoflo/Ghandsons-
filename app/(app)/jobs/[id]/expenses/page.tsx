import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listExpenses } from "@/modules/expenses/queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader, Badge, EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const expenses = await listExpenses({ jobId: id });

  const total = expenses.reduce((a, e) => a + e.subtotalCents, 0);

  return (
    <Card>
      <CardHeader
        title="Costs on this job"
        subtitle={`${expenses.length} expenses · ${formatMoney(total)} ex GST`}
        action={
          can(user.role, "expenses.create") ? (
            <div className="flex gap-2">
              <LinkButton href={`/receipts/capture?jobId=${id}`} size="sm" variant="secondary">📷</LinkButton>
              <LinkButton href={`/expenses/new?jobId=${id}`} size="sm">+ Add</LinkButton>
            </div>
          ) : undefined
        }
      />
      {expenses.length === 0 ? (
        <EmptyState
          icon="💳"
          title="Nothing spent yet"
          body="Every docket you snap on this job lands here and flows into the budget."
          action={<LinkButton href={`/receipts/capture?jobId=${id}`}>📷 Snap a receipt</LinkButton>}
        />
      ) : (
        <ul className="divide-y divide-ink-200">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Link href={`/expenses/${expense.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-ink-50">
                <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">
                  {expense.receiptFileId ? "🧾" : "💳"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{expense.description}</p>
                  <p className="truncate text-sm text-ink-600">
                    {formatDate(expense.expenseDate)} · {expense.supplierName ?? "No supplier"} · {expense.categoryName}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {expense.billed ? (
                      <Badge tone="good">Charged on</Badge>
                    ) : expense.isBillable ? (
                      <Badge tone="warn">To charge on</Badge>
                    ) : (
                      <Badge>Not billable</Badge>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular font-bold">{formatMoney(expense.subtotalCents)}</p>
                  <p className="text-xs text-ink-500">ex GST</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
