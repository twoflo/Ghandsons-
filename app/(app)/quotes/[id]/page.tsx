import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getQuote, getQuoteLines } from "@/modules/quotes/queries";
import { formatMoney, formatBp, marginBp } from "@/lib/money";
import { formatDate, formatDateTime, relativeDueLabel } from "@/lib/dates";
import { QUOTE_STATUS, LINE_KIND, type QuoteStatus } from "@/lib/status";
import { Card, CardHeader, Badge, PageHeader, LinkButton, Alert, DataList } from "@/components/ui";
import { QuoteActionsBar } from "@/modules/quotes/quote-actions-bar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const quote = await getQuote((await params).id);
  return { title: quote ? `${quote.quoteNumber} — ${quote.title}` : "Quote" };
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [quote, lines, jobTypes] = await Promise.all([
    getQuote(id),
    getQuoteLines(id),
    db.execute(sql`SELECT id, name FROM job_types WHERE is_active AND deleted_at IS NULL ORDER BY sort_order`) as unknown as Promise<Array<{ id: string; name: string }>>,
  ]);

  if (!quote) notFound();

  const status = QUOTE_STATUS[quote.status as QuoteStatus];
  const showCost = can(user.role, "jobs.viewMargin");
  const margin = marginBp(quote.costTotalCents, quote.subtotalCents);
  const expired = quote.status === "sent" && quote.validUntil && quote.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={quote.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{quote.quoteNumber}</span>
            {quote.revision > 1 ? <Badge>Revision {quote.revision}</Badge> : null}
            <Badge tone={status.tone}>{status.label}</Badge>
            <Link href={`/clients/${quote.clientId}`} className="underline">{quote.clientName}</Link>
            {quote.jobId ? (
              <Link href={`/jobs/${quote.jobId}`} className="underline">{quote.jobNumber}</Link>
            ) : null}
          </span>
        }
        back={{ href: "/quotes", label: "All quotes" }}
        action={
          can(user.role, "quotes.manage") && quote.status !== "accepted" ? (
            <LinkButton href={`/quotes/${quote.id}/edit`}>Edit</LinkButton>
          ) : undefined
        }
      />

      {expired ? (
        <div className="mb-4">
          <Alert tone="warn" title="This quote has run past its date">
            It said the price held until {formatDate(quote.validUntil)}. Re-price it before the client accepts,
            or start a revision.
          </Alert>
        </div>
      ) : null}

      {quote.status === "accepted" ? (
        <div className="mb-4">
          <Alert tone="good" title={`Accepted by ${quote.acceptedByName}`}>
            {formatDateTime(quote.acceptedAt)}
            {quote.jobId ? null : " — turn it into a job below so the budget carries across."}
          </Alert>
        </div>
      ) : null}

      {quote.status === "rejected" && quote.rejectedReason ? (
        <div className="mb-4">
          <Alert tone="bad" title="We didn't get this one">{quote.rejectedReason}</Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {quote.scopeOfWork ? (
            <Card>
              <CardHeader title="Scope of work" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{quote.scopeOfWork}</p>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Pricing" subtitle={`${lines.filter((l) => !l.isHeading).length} lines`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">Quote lines</caption>
                <thead>
                  <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-2">Item</th>
                    <th scope="col" className="px-2 py-2 text-right">Qty</th>
                    {showCost ? <th scope="col" className="px-2 py-2 text-right">Cost</th> : null}
                    <th scope="col" className="px-2 py-2 text-right">Unit price</th>
                    <th scope="col" className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {lines.map((line) =>
                    line.isHeading ? (
                      <tr key={line.id} className="bg-ink-100">
                        <th scope="rowgroup" colSpan={showCost ? 5 : 4} className="px-4 py-2 text-left font-bold text-ink-800">
                          {line.description}
                        </th>
                      </tr>
                    ) : (
                      <tr key={line.id}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-ink-900">{line.description}</span>
                          <span className="ml-2 text-xs text-ink-500">{LINE_KIND[line.kind]?.label}</span>
                          {line.taxRateBp === 0 ? (
                            <span className="ml-2 text-xs font-bold text-info-700">GST free</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-700">
                          {Number(line.quantity)} {line.unit}
                        </td>
                        {showCost ? (
                          <td className="px-2 py-2.5 text-right tabular text-ink-500">
                            {formatMoney(line.lineCostCents)}
                          </td>
                        ) : null}
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
                  <dd className="tabular font-semibold">{formatMoney(quote.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-ink-700">GST</dt>
                  <dd className="tabular font-semibold">{formatMoney(quote.taxCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t-2 border-ink-300 pt-1.5">
                  <dt className="font-bold text-ink-900">Total</dt>
                  <dd className="tabular text-lg font-black">{formatMoney(quote.totalCents)}</dd>
                </div>
                {showCost ? (
                  <div className="mt-2 flex justify-between gap-4 rounded-lg bg-ink-100 px-3 py-2">
                    <dt className="font-bold text-ink-700">Your margin</dt>
                    <dd className="text-right">
                      <span className="tabular block font-black">{formatMoney(quote.subtotalCents - quote.costTotalCents)}</span>
                      <span className={`text-sm font-bold ${margin < 1000 ? "text-bad-700" : margin < 1800 ? "text-warn-700" : "text-good-700"}`}>
                        {formatBp(margin)}
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </Card>

          {quote.exclusions ? (
            <Card>
              <CardHeader title="Not included" subtitle="The paragraph that stops arguments later" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{quote.exclusions}</p>
            </Card>
          ) : null}

          {quote.terms ? (
            <Card>
              <CardHeader title="Terms" />
              <p className="whitespace-pre-line px-4 py-3 text-sm text-ink-700">{quote.terms}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {can(user.role, "quotes.manage") ? (
            <QuoteActionsBar
              quoteId={quote.id}
              status={quote.status}
              hasJob={Boolean(quote.jobId)}
              jobTypes={jobTypes}
            />
          ) : null}

          <Card>
            <CardHeader title="Details" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  { label: "Dated", value: quote.issueDate ? formatDate(quote.issueDate) : "—" },
                  {
                    label: "Holds until",
                    value: quote.validUntil ? (
                      <span>
                        {formatDate(quote.validUntil)}
                        <span className="block text-sm text-ink-500">{relativeDueLabel(quote.validUntil)}</span>
                      </span>
                    ) : "—",
                  },
                  { label: "Site", value: quote.siteAddress ?? quote.siteLabel ?? "—" },
                  { label: "Written by", value: quote.createdByName ?? "—" },
                  ...(quote.sentAt ? [{ label: "Sent", value: formatDateTime(quote.sentAt) }] : []),
                ]}
              />
            </div>
          </Card>

          {quote.internalNotes ? (
            <Card>
              <CardHeader title="Internal notes" subtitle="Not on the PDF" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{quote.internalNotes}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
