import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSupplier, listPurchaseOrders } from "@/modules/procurement/queries";
import { listExpenses } from "@/modules/expenses/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/dates";
import { PO_STATUS, type PoStatus } from "@/lib/status";
import {
  PageHeader, Card, CardHeader, DataList, Badge, StatTile, EmptyState, LinkButton,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supplier = await getSupplier((await params).id);
  return { title: supplier?.name ?? "Supplier" };
}

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [supplier, expenses, orders] = await Promise.all([
    getSupplier(id),
    listExpenses({ supplierId: id, limit: 25 }),
    listPurchaseOrders({ supplierId: id }),
  ]);
  if (!supplier) notFound();

  const address = [supplier.addressLine1, supplier.suburb, supplier.state, supplier.postcode]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={supplier.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {supplier.abn ? <span>ABN {supplier.abn}</span> : null}
            {supplier.accountNumber ? <Badge>Acct {supplier.accountNumber}</Badge> : null}
            <span>{supplier.paymentTermsDays} day terms</span>
          </span>
        }
        back={{ href: "/suppliers", label: "All suppliers" }}
        action={
          can(user.role, "suppliers.manage") ? (
            <div className="flex gap-2">
              <LinkButton href={`/purchase-orders/new?supplierId=${id}`} variant="secondary">+ Order</LinkButton>
              <LinkButton href={`/suppliers/${id}/edit`}>Edit</LinkButton>
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Last 12 months" value={formatMoney(supplier.spendYtdCents)} />
        <StatTile label="All time" value={formatMoney(supplier.spendAllTimeCents)} />
        <StatTile label="Purchases" value={supplier.expenseCount} />
        <StatTile
          label="Orders out"
          value={supplier.openPoCount}
          tone={supplier.openPoCount > 0 ? "info" : "neutral"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Purchase orders"
              action={
                can(user.role, "po.manage") ? (
                  <LinkButton href={`/purchase-orders/new?supplierId=${id}`} size="sm" variant="secondary">
                    + New
                  </LinkButton>
                ) : undefined
              }
            />
            {orders.length === 0 ? (
              <EmptyState icon="📦" title="No orders" body="Raise one so you can check the invoice against it later." />
            ) : (
              <ul className="divide-y divide-ink-200">
                {orders.map((po) => (
                  <li key={po.id}>
                    <Link href={`/purchase-orders/${po.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">
                          {po.poNumber}
                          {po.jobNumber ? <span className="ml-2 text-sm font-normal text-ink-500">{po.jobNumber}</span> : null}
                        </p>
                        <p className="text-sm text-ink-600">
                          {po.orderDate ? formatDate(po.orderDate) : "Draft"}
                          {po.expectedDate ? ` · due ${formatDate(po.expectedDate)}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular font-bold">{formatMoney(po.totalCents)}</p>
                        <Badge tone={po.daysLate > 0 && po.status !== "received" ? "bad" : PO_STATUS[po.status as PoStatus].tone}>
                          {po.daysLate > 0 && po.status !== "received" && po.status !== "invoiced"
                            ? `${po.daysLate}d late`
                            : PO_STATUS[po.status as PoStatus].label}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="What you've bought" subtitle={`${expenses.length} most recent`} />
            {expenses.length === 0 ? (
              <EmptyState icon="💳" title="Nothing yet" body="Expenses tagged to this supplier will show here." />
            ) : (
              <ul className="divide-y divide-ink-200">
                {expenses.map((expense) => (
                  <li key={expense.id}>
                    <Link href={`/expenses/${expense.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink-50">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{expense.description}</p>
                        <p className="text-sm text-ink-600">
                          {formatDate(expense.expenseDate)}
                          {expense.jobNumber ? ` · ${expense.jobNumber}` : " · overhead"}
                        </p>
                      </div>
                      <p className="tabular shrink-0 font-bold">{formatMoney(expense.totalCents)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  { label: "Contact", value: supplier.contactName ?? "—" },
                  {
                    label: "Phone",
                    value: supplier.phone ? (
                      <a href={`tel:${supplier.phone.replace(/\s/g, "")}`} className="font-semibold underline">
                        {supplier.phone}
                      </a>
                    ) : "—",
                  },
                  {
                    label: "Email",
                    value: supplier.email ? (
                      <a href={`mailto:${supplier.email}`} className="break-all font-semibold underline">
                        {supplier.email}
                      </a>
                    ) : "—",
                  },
                  { label: "Address", value: address || "—" },
                  { label: "Usually", value: supplier.defaultCategoryName ?? "—" },
                  { label: "Last used", value: supplier.lastUsed ? timeAgo(supplier.lastUsed) : "Never" },
                ]}
              />
            </div>
          </Card>

          {supplier.aliases.length > 0 ? (
            <Card>
              <CardHeader
                title="How their name prints"
                subtitle="Learned from receipts you've checked — these all match this supplier"
              />
              <ul className="space-y-1 px-4 py-3">
                {supplier.aliases.map((alias) => (
                  <li key={alias} className="font-mono text-sm text-ink-700">{alias}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {supplier.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{supplier.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
