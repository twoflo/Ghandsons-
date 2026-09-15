import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSuppliers } from "@/modules/procurement/queries";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/lib/dates";
import { PageHeader, Card, Badge, EmptyState, LinkButton, Input, StatTile } from "@/components/ui";

export const metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const suppliers = await listSuppliers(q);

  const totalSpend = suppliers.reduce((a, s) => a + s.spendYtdCents, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Suppliers"
        subtitle={`${suppliers.length} on the books`}
        action={
          can(user.role, "suppliers.manage") ? <LinkButton href="/suppliers/new">+ New supplier</LinkButton> : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile label="Spent with them, last 12 months" value={formatMoney(totalSpend)} />
        <StatTile
          label="Orders out"
          value={suppliers.reduce((a, s) => a + s.openPoCount, 0)}
          href="/purchase-orders"
        />
      </div>

      <form method="get" className="mb-4">
        <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search supplier, ABN, contact…"
               aria-label="Search suppliers" enterKeyHint="search" />
      </form>

      {suppliers.length === 0 ? (
        <Card>
          <EmptyState
            icon="🚚"
            title={q ? "No supplier matched" : "No suppliers yet"}
            body="Add the places you buy from and receipts will match themselves to the right one."
            action={
              can(user.role, "suppliers.manage") ? <LinkButton href="/suppliers/new">+ New supplier</LinkButton> : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="card">
              <Link href={`/suppliers/${supplier.id}`} className="flex items-start justify-between gap-3 p-4 hover:bg-ink-50">
                <div className="min-w-0">
                  <p className="font-bold text-ink-900">{supplier.name}</p>
                  <p className="truncate text-sm text-ink-600">
                    {[supplier.contactName, supplier.phone, supplier.suburb].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {supplier.defaultCategoryName ? (
                      <Badge>{supplier.defaultCategoryName}</Badge>
                    ) : null}
                    {supplier.accountNumber ? (
                      <span className="text-xs text-ink-500">Acct {supplier.accountNumber}</span>
                    ) : null}
                    {supplier.openPoCount > 0 ? (
                      <Badge tone="info">{supplier.openPoCount} order{supplier.openPoCount === 1 ? "" : "s"} out</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular font-black text-ink-900">{formatMoney(supplier.spendYtdCents)}</p>
                  <p className="text-xs text-ink-500">last 12 months</p>
                  {supplier.lastUsed ? (
                    <p className="mt-1 text-xs text-ink-500">Last used {timeAgo(supplier.lastUsed)}</p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
