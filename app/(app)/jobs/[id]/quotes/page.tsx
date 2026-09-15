import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listQuotes } from "@/modules/quotes/queries";
import { formatMoney, formatBp } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { QUOTE_STATUS, type QuoteStatus } from "@/lib/status";
import { Card, CardHeader, Badge, EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobQuotesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const quotes = await listQuotes({ jobId: id });
  const showMargin = can(user.role, "jobs.viewMargin");

  return (
    <Card>
      <CardHeader
        title="Quotes for this job"
        action={
          can(user.role, "quotes.manage") ? (
            <LinkButton href={`/quotes/new?jobId=${id}`} size="sm">+ New quote</LinkButton>
          ) : undefined
        }
      />
      {quotes.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No quotes on this job"
          body="If the job started from a quote, link it here so the budget lines up with what you promised."
          action={
            can(user.role, "quotes.manage") ? (
              <LinkButton href={`/quotes/new?jobId=${id}`}>+ New quote</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-ink-200">
          {quotes.map((quote) => {
            const status = QUOTE_STATUS[quote.status as QuoteStatus];
            return (
              <li key={quote.id}>
                <Link href={`/quotes/${quote.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {quote.quoteNumber} — {quote.title}
                    </p>
                    <p className="text-sm text-ink-600">
                      {quote.issueDate ? formatDate(quote.issueDate) : "Not dated"} · {quote.lineCount} lines
                      {showMargin ? ` · ${formatBp(quote.marginBp)} margin` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-bold">{formatMoney(quote.totalCents)}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
