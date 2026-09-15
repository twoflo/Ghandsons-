import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listInvoices, getJobClaimContext } from "@/modules/invoices/queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { INVOICE_STATUS, type InvoiceStatus } from "@/lib/status";
import { Card, CardHeader, Badge, EmptyState, LinkButton, Progress } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [invoices, claim] = await Promise.all([listInvoices({ jobId: id }), getJobClaimContext(id)]);

  const owing = invoices.reduce((a, i) => a + (i.status === "void" ? 0 : i.balanceCents), 0);

  return (
    <div className="space-y-5">
      {claim && claim.revisedContractCents > 0 ? (
        <Card>
          <CardHeader title="How much of the contract you've claimed" />
          <div className="p-4">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-ink-700">
                {formatMoney(claim.alreadyClaimedCents)} of {formatMoney(claim.revisedContractCents)}
              </span>
              <span className="font-bold text-ink-900">
                {Math.round((claim.alreadyClaimedCents / claim.revisedContractCents) * 100)}%
              </span>
            </div>
            <Progress
              value={claim.alreadyClaimedCents}
              max={claim.revisedContractCents}
              tone="info"
              label="Contract claimed"
            />
            {owing > 0 ? (
              <p className="mt-2 font-semibold text-bad-700">{formatMoney(owing)} of that is still outstanding.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Invoices"
          action={
            can(user.role, "invoices.manage") ? (
              <LinkButton href={`/invoices/new?jobId=${id}`} size="sm">+ Raise a claim</LinkButton>
            ) : undefined
          }
        />
        {invoices.length === 0 ? (
          <EmptyState
            icon="💰"
            title="Nothing invoiced yet"
            body="Raise a deposit to get the job funded, then progress claims as you go."
            action={
              can(user.role, "invoices.manage") ? (
                <LinkButton href={`/invoices/new?jobId=${id}`}>Raise a claim</LinkButton>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-ink-200">
            {invoices.map((invoice) => {
              const status = INVOICE_STATUS[invoice.status as InvoiceStatus];
              const overdue = invoice.daysOverdue > 0 && invoice.balanceCents > 0;
              return (
                <li key={invoice.id}>
                  <Link href={`/invoices/${invoice.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">
                        {invoice.invoiceNumber}
                        {invoice.type !== "standard" ? (
                          <span className="ml-2 text-sm font-normal capitalize text-ink-500">{invoice.type}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-ink-600">
                        {invoice.issueDate ? formatDate(invoice.issueDate) : "Draft"}
                        {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-bold">{formatMoney(invoice.totalCents)}</p>
                      <Badge tone={overdue ? "bad" : status.tone}>
                        {overdue ? `${invoice.daysOverdue}d overdue` : status.label}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
