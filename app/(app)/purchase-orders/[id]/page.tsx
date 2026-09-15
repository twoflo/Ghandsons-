import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getPurchaseOrder, getPoLines, getPoReceipts, getPoMatches, getMatchableExpenses,
} from "@/modules/procurement/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, relativeDueLabel } from "@/lib/dates";
import { PO_STATUS, type PoStatus } from "@/lib/status";
import { PageHeader, Card, CardHeader, Badge, DataList, Alert } from "@/components/ui";
import { PoPanel } from "@/modules/procurement/po-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const po = await getPurchaseOrder((await params).id);
  return { title: po ? `${po.poNumber} — ${po.supplierName}` : "Purchase order" };
}

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const [lines, receipts, matches, matchable] = await Promise.all([
    getPoLines(id),
    getPoReceipts(id),
    getPoMatches(id),
    getMatchableExpenses(id, po.supplierId),
  ]);

  const status = PO_STATUS[po.status as PoStatus];
  const overdue = po.daysLate > 0 && !["received", "invoiced", "cancelled"].includes(po.status);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`${po.poNumber} — ${po.supplierName}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={overdue ? "bad" : status.tone}>
              {overdue ? `${po.daysLate} days late` : status.label}
            </Badge>
            <Link href={`/suppliers/${po.supplierId}`} className="underline">{po.supplierName}</Link>
            {po.jobId ? (
              <Link href={`/jobs/${po.jobId}`} className="underline">
                {po.jobNumber} — {po.jobTitle}
              </Link>
            ) : null}
          </span>
        }
        back={{ href: "/purchase-orders", label: "All orders" }}
      />

      {overdue ? (
        <div className="mb-4">
          <Alert tone="bad" title={`This was due ${po.daysLate} days ago`}>
            {po.expectedDate ? `Expected ${formatDate(po.expectedDate)}.` : ""} Worth a phone call — a
            late delivery is usually what puts a job behind.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="What's on order" subtitle={`${lines.length} lines`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">Purchase order lines</caption>
                <thead>
                  <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-2">Item</th>
                    <th scope="col" className="px-2 py-2 text-right">Ordered</th>
                    <th scope="col" className="px-2 py-2 text-right">Delivered</th>
                    <th scope="col" className="px-2 py-2 text-right">Each</th>
                    <th scope="col" className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {lines.map((line) => {
                    const ordered = Number(line.quantity);
                    const received = Number(line.quantityReceived);
                    const short = received < ordered;
                    return (
                      <tr key={line.id}>
                        <td className="px-4 py-2.5 text-ink-900">{line.description}</td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-700">
                          {ordered} {line.unit}
                        </td>
                        <td
                          className={`px-2 py-2.5 text-right tabular font-semibold ${
                            short ? "text-warn-700" : "text-good-700"
                          }`}
                        >
                          {received}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-700">
                          {formatMoney(line.unitCostCents)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular font-semibold">
                          {formatMoney(line.lineSubtotalCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t-2 border-ink-300 px-4 py-3">
              <dl className="ml-auto max-w-xs space-y-1.5">
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-ink-700">Ex GST</dt>
                  <dd className="tabular font-semibold">{formatMoney(po.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-ink-700">GST</dt>
                  <dd className="tabular font-semibold">{formatMoney(po.taxCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t-2 border-ink-300 pt-1.5">
                  <dt className="font-bold">Total</dt>
                  <dd className="tabular text-lg font-black">{formatMoney(po.totalCents)}</dd>
                </div>
              </dl>
            </div>
          </Card>

          {po.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{po.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <PoPanel
            po={po}
            lines={lines}
            receipts={receipts}
            matches={matches}
            matchable={matchable}
            canManage={can(user.role, "po.manage")}
          />

          <Card>
            <CardHeader title="Details" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  { label: "Ordered", value: po.orderDate ? formatDate(po.orderDate) : "Not sent yet" },
                  {
                    label: "Expected",
                    value: po.expectedDate ? (
                      <span>
                        {formatDate(po.expectedDate)}
                        <span className={`block text-sm ${overdue ? "text-bad-700" : "text-ink-500"}`}>
                          {relativeDueLabel(po.expectedDate)}
                        </span>
                      </span>
                    ) : "—",
                  },
                  { label: "Deliver to", value: po.deliverTo ?? "—" },
                  { label: "Their terms", value: `${po.supplierTerms} days` },
                  { label: "Raised by", value: po.createdByName ?? "—" },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
