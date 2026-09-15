import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listQuotes, getQuoteStats } from "@/modules/quotes/queries";
import { formatMoney, formatBp } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { QUOTE_STATUS, type QuoteStatus } from "@/lib/status";
import { PageHeader, Card, Badge, EmptyState, LinkButton, Input, StatTile } from "@/components/ui";

export const metadata = { title: "Quotes" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Out with clients" },
  { key: "accepted", label: "Won" },
  { key: "rejected", label: "Lost" },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { status, q } = await searchParams;
  const [quotes, stats] = await Promise.all([
    listQuotes({ status, search: q }),
    getQuoteStats(),
  ]);

  const showCost = can(user.role, "jobs.viewMargin");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Quotes"
        subtitle={`${quotes.length} shown`}
        action={can(user.role, "quotes.manage") ? <LinkButton href="/quotes/new">+ New quote</LinkButton> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Out with clients" value={stats.sentCount} sub={formatMoney(stats.sentValueCents)} tone="info" />
        <StatTile label="Won, not started" value={stats.acceptedCount} sub={formatMoney(stats.acceptedValueCents)} tone="good" />
        <StatTile label="Win rate" value={formatBp(stats.winRateBp)} sub="of quotes decided" />
        <StatTile
          label="Expiring this week"
          value={stats.expiringSoon}
          sub={stats.expiringSoon > 0 ? "Chase them up" : "Nothing urgent"}
          tone={stats.expiringSoon > 0 ? "warn" : "neutral"}
        />
      </div>

      <form method="get" className="mb-3">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search quote, client…"
               aria-label="Search quotes" enterKeyHint="search" />
      </form>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter quotes">
        {TABS.map((tab) => {
          const active = (status ?? "") === tab.key;
          return (
            <Link
              key={tab.key || "all"}
              href={tab.key ? `/quotes?status=${tab.key}` : "/quotes"}
              className={`inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold ${
                active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {quotes.length === 0 ? (
        <Card>
          <EmptyState
            icon="📝"
            title={q || status ? "Nothing here" : "No quotes yet"}
            body={
              q || status
                ? "Try clearing the filter or the search."
                : "Build one from the price book — it takes a couple of minutes and the margin is worked out for you."
            }
            action={
              q || status ? (
                <LinkButton href="/quotes" variant="secondary">Show all</LinkButton>
              ) : can(user.role, "quotes.manage") ? (
                <LinkButton href="/quotes/new">+ New quote</LinkButton>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {quotes.map((quote) => {
            const s = QUOTE_STATUS[quote.status as QuoteStatus];
            const expiringSoon =
              quote.status === "sent" && quote.daysToExpiry !== null && quote.daysToExpiry <= 7;
            return (
              <li key={quote.id} className="card">
                <Link href={`/quotes/${quote.id}`} className="block p-4 hover:bg-ink-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                        {quote.quoteNumber}
                        {quote.jobNumber ? ` · ${quote.jobNumber}` : ""}
                      </p>
                      <h2 className="font-bold text-ink-900">{quote.title}</h2>
                      <p className="truncate text-sm text-ink-600">{quote.clientName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-lg font-black text-ink-900">{formatMoney(quote.totalCents)}</p>
                      <Badge tone={expiringSoon ? "warn" : s.tone}>
                        {expiringSoon ? `${quote.daysToExpiry}d left` : s.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                    <span>{quote.issueDate ? formatDate(quote.issueDate) : "Not dated"}</span>
                    <span>{quote.lineCount} lines</span>
                    {showCost && quote.subtotalCents > 0 ? (
                      <span
                        className={`font-semibold ${
                          quote.marginBp < 1000 ? "text-bad-700" : quote.marginBp < 1800 ? "text-warn-700" : "text-good-700"
                        }`}
                      >
                        {formatBp(quote.marginBp)} margin
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
