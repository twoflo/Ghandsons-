import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listReceiptQueue, getQueueCounts } from "@/modules/receipts/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/dates";
import { RECEIPT_STATUS, type ReceiptStatus } from "@/lib/status";
import { PageHeader, Card, Badge, EmptyState, LinkButton, StatTile } from "@/components/ui";
import { QueueRefresher } from "@/modules/receipts/queue-refresher";

export const metadata = { title: "Receipts" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "needs_review", label: "To check" },
  { key: "processing", label: "Being read" },
  { key: "failed", label: "Couldn't read" },
  { key: "approved", label: "Done" },
  { key: "all", label: "Everything" },
] as const;

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: (typeof TABS)[number]["key"] }>;
}) {
  const user = await requireUser();
  const { status = "needs_review" } = await searchParams;

  const [queue, counts] = await Promise.all([listReceiptQueue(status), getQueueCounts()]);
  const canReview = can(user.role, "receipts.review");

  return (
    <div className="mx-auto max-w-4xl">
      {/* Nudges the page while anything is still being read. */}
      {counts.processing > 0 ? <QueueRefresher /> : null}

      <PageHeader
        title="Receipts"
        subtitle="Snap a docket and it gets read for you. You check it, then it's an expense."
        action={<LinkButton href="/receipts/capture" size="lg">📷 Snap one</LinkButton>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="To check"
          value={counts.needsReview}
          sub={counts.needsReview > 0 ? "A minute each, about" : "All clear"}
          tone={counts.needsReview > 0 ? "warn" : "good"}
        />
        <StatTile label="Being read" value={counts.processing} tone={counts.processing > 0 ? "info" : "neutral"} />
        <StatTile
          label="Couldn't read"
          value={counts.failed}
          sub={counts.failed > 0 ? "Type these in by hand" : "None"}
          tone={counts.failed > 0 ? "bad" : "neutral"}
        />
        <StatTile label="Done today" value={counts.approvedToday} tone="good" />
      </div>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter receipts">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/receipts?status=${tab.key}`}
            className={`inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold ${
              status === tab.key ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            icon="🧾"
            title={status === "needs_review" ? "Nothing waiting" : "Nothing here"}
            body={
              status === "needs_review"
                ? "Every receipt has been checked and saved. Snap the next lot whenever."
                : "Try another tab."
            }
            action={<LinkButton href="/receipts/capture">📷 Snap a receipt</LinkButton>}
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {queue.map((item) => {
            const badge = RECEIPT_STATUS[item.status as ReceiptStatus];
            const unsure = (item.overallConfidence ?? 0) < 80;
            const href = canReview
              ? item.expenseId
                ? `/expenses/${item.expenseId}`
                : `/receipts/${item.id}`
              : `/receipts/${item.id}`;
            return (
              <li key={item.id} className="card overflow-hidden">
                <Link href={href} className="flex gap-3 p-3 hover:bg-ink-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${item.fileId}`}
                    alt=""
                    className="h-24 w-20 shrink-0 rounded border border-ink-200 bg-ink-100 object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-bold text-ink-900">
                        {item.supplierGuess ?? "Not read yet"}
                      </p>
                      <Badge tone={item.status === "needs_review" && unsure ? "warn" : badge.tone}>
                        {badge.label}
                      </Badge>
                    </div>
                    {item.totalCents ? (
                      <p className="tabular text-lg font-black text-ink-900">
                        {formatMoney(item.totalCents)}
                      </p>
                    ) : null}
                    <p className="text-sm text-ink-600">
                      {item.receiptDate ? formatDate(item.receiptDate) : "No date read"}
                      {item.suggestedJobNumber ? ` · ${item.suggestedJobNumber}` : ""}
                    </p>
                    {item.errorMessage ? (
                      <p className="mt-1 text-sm font-medium text-bad-700">{item.errorMessage}</p>
                    ) : item.arithmeticOk === false ? (
                      <p className="mt-1 text-sm font-medium text-warn-700">The numbers don&apos;t add up</p>
                    ) : item.overallConfidence !== null && unsure ? (
                      <p className="mt-1 text-sm font-medium text-warn-700">
                        Only {item.overallConfidence}% sure — worth a look
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-500">
                      {item.uploadedByName ?? "Someone"} · {timeAgo(item.createdAt)}
                    </p>
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
