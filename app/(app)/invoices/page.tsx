import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listInvoices, getReceivablesSummary, type InvoiceFilter } from "@/modules/invoices/queries";
import { refreshOverdueStatuses } from "@/modules/invoices/actions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { INVOICE_STATUS, type InvoiceStatus } from "@/lib/status";
import { PageHeader, Card, Badge, EmptyState, LinkButton, Input, StatTile } from "@/components/ui";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const TABS: Array<{ key: InvoiceFilter; label: string }> = [
  { key: "unpaid", label: "Waiting on money" },
  { key: "overdue", label: "Overdue" },
  { key: "draft", label: "Drafts" },
  { key: "paid", label: "Paid" },
  { key: "all", label: "All" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: InvoiceFilter; q?: string }>;
}) {
  const user = await requireUser();
  const { filter = "unpaid", q } = await searchParams;

  // Anything past its due date becomes Overdue the moment someone looks.
  await refreshOverdueStatuses();

  const [invoices, aged] = await Promise.all([
    listInvoices({ filter, search: q }),
    getReceivablesSummary(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} shown`}
        action={
          can(user.role, "invoices.manage") ? <LinkButton href="/invoices/new">+ New invoice</LinkButton> : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Not due yet" value={formatMoney(aged.currentCents)} tone="neutral" />
        <StatTile label="1–30 days over" value={formatMoney(aged.b1Cents)} tone={aged.b1Cents > 0 ? "warn" : "neutral"} />
        <StatTile label="31–60 days" value={formatMoney(aged.b2Cents)} tone={aged.b2Cents > 0 ? "warn" : "neutral"} />
        <StatTile label="61–90 days" value={formatMoney(aged.b3Cents)} tone={aged.b3Cents > 0 ? "bad" : "neutral"} />
        <StatTile label="Over 90 days" value={formatMoney(aged.b4Cents)} tone={aged.b4Cents > 0 ? "bad" : "neutral"} />
      </div>

      <form method="get" className="mb-3">
        <input type="hidden" name="filter" value={filter} />
        <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search invoice, client, job…"
               aria-label="Search invoices" enterKeyHint="search" />
      </form>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter invoices">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/invoices?filter=${tab.key}`}
            className={`inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold ${
              filter === tab.key ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon="💰"
            title={filter === "unpaid" ? "Nothing outstanding" : "Nothing here"}
            body={
              filter === "unpaid"
                ? "Everyone's paid up. Enjoy it while it lasts."
                : "Try another tab, or clear the search."
            }
            action={
              can(user.role, "invoices.manage") ? <LinkButton href="/invoices/new">+ New invoice</LinkButton> : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {invoices.map((invoice) => {
            const status = INVOICE_STATUS[invoice.status as InvoiceStatus];
            const overdue = invoice.daysOverdue > 0 && invoice.balanceCents > 0 && invoice.status !== "void";
            return (
              <li key={invoice.id} className="card">
                <Link href={`/invoices/${invoice.id}`} className="block p-4 hover:bg-ink-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                        {invoice.invoiceNumber}
                        {invoice.type !== "standard" ? ` · ${invoice.type}` : ""}
                        {invoice.jobNumber ? ` · ${invoice.jobNumber}` : ""}
                      </p>
                      <h2 className="font-bold text-ink-900">{invoice.clientName}</h2>
                      <p className="truncate text-sm text-ink-600">{invoice.jobTitle ?? "No job"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-lg font-black text-ink-900">{formatMoney(invoice.totalCents)}</p>
                      <Badge tone={overdue ? "bad" : status.tone}>
                        {overdue ? `${invoice.daysOverdue}d overdue` : status.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                    <span>{invoice.issueDate ? formatDate(invoice.issueDate) : "Not issued"}</span>
                    {invoice.dueDate ? <span>Due {formatDate(invoice.dueDate)}</span> : null}
                    {invoice.amountPaidCents > 0 && invoice.balanceCents > 0 ? (
                      <span className="font-semibold text-warn-700">
                        {formatMoney(invoice.amountPaidCents)} paid, {formatMoney(invoice.balanceCents)} to go
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
