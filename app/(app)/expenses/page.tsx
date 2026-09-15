import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listExpenses, getExpenseTotals, type ExpenseFilter } from "@/modules/expenses/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, financialYear } from "@/lib/dates";
import { LINE_KIND } from "@/lib/status";
import { PageHeader, Card, Badge, EmptyState, LinkButton, Input, StatTile } from "@/components/ui";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

const TABS: Array<{ key: ExpenseFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unbilled", label: "Not charged on yet" },
  { key: "no_job", label: "Overheads" },
  { key: "no_receipt", label: "Missing a receipt" },
];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: ExpenseFilter; q?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const { filter = "all", q, from, to } = await searchParams;
  const fy = financialYear();

  const [expenses, totals] = await Promise.all([
    listExpenses({ filter, search: q, from, to }),
    getExpenseTotals({ from: from ?? fy.start, to }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Expenses"
        subtitle={`${expenses.length} shown`}
        action={
          <div className="flex gap-2">
            <LinkButton href="/receipts/capture" variant="secondary">📷 Snap one</LinkButton>
            {can(user.role, "expenses.create") ? (
              <LinkButton href="/expenses/new">+ Add by hand</LinkButton>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Spent ${fy.label}`} value={formatMoney(totals.totalCents)} sub={`${totals.count} expenses`} />
        <StatTile label="GST paid" value={formatMoney(totals.taxCents)} sub="Claimable on the BAS" tone="info" />
        <StatTile
          label="Not charged on"
          value={formatMoney(totals.unbilledCents)}
          sub="Billable, sitting on jobs"
          tone={totals.unbilledCents > 0 ? "warn" : "neutral"}
          href="/expenses?filter=unbilled"
        />
        <StatTile
          label="Missing a receipt"
          value={totals.noReceiptCount}
          sub="The ATO wants the paperwork"
          tone={totals.noReceiptCount > 0 ? "warn" : "good"}
          href="/expenses?filter=no_receipt"
        />
      </div>

      <form method="get" className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input type="hidden" name="filter" value={filter} />
        <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search supplier, description, job…"
               aria-label="Search expenses" enterKeyHint="search" />
        <Input type="date" name="from" defaultValue={from ?? ""} aria-label="From date" />
        <Input type="date" name="to" defaultValue={to ?? ""} aria-label="To date" />
      </form>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter expenses">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/expenses?filter=${tab.key}`}
            className={`inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold ${
              filter === tab.key ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {expenses.length === 0 ? (
        <Card>
          <EmptyState
            icon="💳"
            title="Nothing here"
            body={
              filter === "no_receipt"
                ? "Every expense has its receipt attached. Good."
                : "Snap a docket with your phone and it'll be read for you, or add one by hand."
            }
            action={<LinkButton href="/receipts/capture">📷 Snap a receipt</LinkButton>}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {expenses.map((expense) => (
            <li key={expense.id} className="card">
              <Link href={`/expenses/${expense.id}`} className="flex items-start gap-3 p-3 hover:bg-ink-50">
                <span className="mt-0.5 shrink-0 text-xl" aria-hidden="true">
                  {expense.receiptFileId ? "🧾" : "💳"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{expense.description}</p>
                  <p className="truncate text-sm text-ink-600">
                    {[
                      expense.supplierName ?? expense.supplierNameRaw,
                      expense.categoryName,
                      expense.jobNumber ? `${expense.jobNumber} ${expense.jobTitle}` : "Overhead",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink-500">{formatDate(expense.expenseDate)}</span>
                    {expense.categoryKind ? (
                      <Badge tone={LINE_KIND[expense.categoryKind]?.tone ?? "neutral"}>
                        {LINE_KIND[expense.categoryKind]?.label ?? expense.categoryKind}
                      </Badge>
                    ) : null}
                    {expense.isBillable && !expense.billed && expense.jobId ? (
                      <Badge tone="warn">To charge on</Badge>
                    ) : null}
                    {expense.billed ? <Badge tone="good">Charged on</Badge> : null}
                    {!expense.receiptFileId ? <Badge tone="bad">No receipt</Badge> : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular font-black text-ink-900">{formatMoney(expense.totalCents)}</p>
                  <p className="text-xs text-ink-500">inc {formatMoney(expense.taxCents)} GST</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
