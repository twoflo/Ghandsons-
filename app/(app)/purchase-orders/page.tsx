import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPurchaseOrders } from "@/modules/procurement/queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PO_STATUS, type PoStatus } from "@/lib/status";
import { PageHeader, Card, Badge, EmptyState, LinkButton, Input, StatTile, Progress } from "@/components/ui";

export const metadata = { title: "Purchase orders" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Ordered" },
  { key: "part_received", label: "Part delivered" },
  { key: "received", label: "Delivered" },
];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { status, q } = await searchParams;
  const orders = await listPurchaseOrders({ status, search: q });

  const committed = orders
    .filter((o) => ["sent", "part_received", "received"].includes(o.status))
    .reduce((a, o) => a + o.subtotalCents, 0);
  const late = orders.filter((o) => o.daysLate > 0 && !["received", "invoiced", "cancelled"].includes(o.status));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Purchase orders"
        subtitle={`${orders.length} shown`}
        action={can(user.role, "po.manage") ? <LinkButton href="/purchase-orders/new">+ New order</LinkButton> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile label="Committed, not yet invoiced" value={formatMoney(committed)} sub="Counts against job budgets" />
        <StatTile
          label="Overdue deliveries"
          value={late.length}
          sub={late.length > 0 ? "Chase the supplier" : "Everything's on time"}
          tone={late.length > 0 ? "bad" : "good"}
        />
      </div>

      <form method="get" className="mb-3">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search order, supplier, job…"
               aria-label="Search purchase orders" enterKeyHint="search" />
      </form>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter orders">
        {TABS.map((tab) => (
          <Link
            key={tab.key || "all"}
            href={tab.key ? `/purchase-orders?status=${tab.key}` : "/purchase-orders"}
            className={`inline-flex min-h-[var(--tap)] shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold ${
              (status ?? "") === tab.key ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon="📦"
            title="No orders here"
            body="Raise a PO before a big delivery — it's the only way to tell later whether the invoice matches what you actually ordered."
            action={can(user.role, "po.manage") ? <LinkButton href="/purchase-orders/new">+ New order</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {orders.map((po) => {
            const overdue = po.daysLate > 0 && !["received", "invoiced", "cancelled"].includes(po.status);
            return (
              <li key={po.id} className="card">
                <Link href={`/purchase-orders/${po.id}`} className="block p-4 hover:bg-ink-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                        {po.poNumber}
                        {po.jobNumber ? ` · ${po.jobNumber}` : ""}
                      </p>
                      <p className="font-bold text-ink-900">{po.supplierName}</p>
                      <p className="truncate text-sm text-ink-600">
                        {po.jobTitle ?? "No job"} · {po.lineCount} line{po.lineCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-black text-ink-900">{formatMoney(po.totalCents)}</p>
                      <Badge tone={overdue ? "bad" : PO_STATUS[po.status as PoStatus].tone}>
                        {overdue ? `${po.daysLate}d late` : PO_STATUS[po.status as PoStatus].label}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                    {po.orderDate ? <span>Ordered {formatDate(po.orderDate)}</span> : null}
                    {po.expectedDate ? <span>Due {formatDate(po.expectedDate)}</span> : null}
                  </div>
                  {po.status === "part_received" ? (
                    <div className="mt-2">
                      <Progress value={po.receivedPct} max={100} tone="warn" label="Delivered so far" />
                      <p className="mt-1 text-xs text-ink-500">{po.receivedPct}% delivered</p>
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
