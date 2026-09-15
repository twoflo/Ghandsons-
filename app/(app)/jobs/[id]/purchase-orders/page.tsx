import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPurchaseOrders } from "@/modules/procurement/queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PO_STATUS, type PoStatus } from "@/lib/status";
import { Card, CardHeader, Badge, EmptyState, LinkButton, Progress } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobPurchaseOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const orders = await listPurchaseOrders({ jobId: id });

  const committed = orders
    .filter((o) => ["sent", "part_received", "received"].includes(o.status))
    .reduce((a, o) => a + o.subtotalCents, 0);

  return (
    <Card>
      <CardHeader
        title="Orders on this job"
        subtitle={committed > 0 ? `${formatMoney(committed)} committed, ex GST` : undefined}
        action={
          can(user.role, "po.manage") ? (
            <LinkButton href={`/purchase-orders/new?jobId=${id}`} size="sm">+ New order</LinkButton>
          ) : undefined
        }
      />
      {orders.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Nothing on order"
          body="Raising a PO before a big delivery means you can check the invoice against what you actually asked for."
          action={
            can(user.role, "po.manage") ? (
              <LinkButton href={`/purchase-orders/new?jobId=${id}`}>+ New order</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-ink-200">
          {orders.map((po) => {
            const overdue = po.daysLate > 0 && !["received", "invoiced", "cancelled"].includes(po.status);
            return (
              <li key={po.id}>
                <Link href={`/purchase-orders/${po.id}`} className="block px-4 py-3 hover:bg-ink-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">
                        {po.poNumber} — {po.supplierName}
                      </p>
                      <p className="text-sm text-ink-600">
                        {po.lineCount} line{po.lineCount === 1 ? "" : "s"}
                        {po.expectedDate ? ` · due ${formatDate(po.expectedDate)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-bold">{formatMoney(po.totalCents)}</p>
                      <Badge tone={overdue ? "bad" : PO_STATUS[po.status as PoStatus].tone}>
                        {overdue ? `${po.daysLate}d late` : PO_STATUS[po.status as PoStatus].label}
                      </Badge>
                    </div>
                  </div>
                  {po.status === "part_received" ? (
                    <div className="mt-2">
                      <Progress value={po.receivedPct} max={100} tone="warn" label="Delivered" />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
