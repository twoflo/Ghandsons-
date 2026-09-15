import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listClients } from "@/modules/clients/queries";
import { formatMoney } from "@/lib/money";
import { relativeDueLabel, timeAgo } from "@/lib/dates";
import { PageHeader, Card, EmptyState, LinkButton, Input, Badge } from "@/components/ui";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const clients = await listClients(q);

  const totalOwed = clients.reduce((a, c) => a + c.outstandingCents, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Clients"
        subtitle={
          totalOwed > 0 ? (
            <>
              {clients.length} clients ·{" "}
              <span className="font-bold text-bad-700">{formatMoney(totalOwed)} outstanding</span>
            </>
          ) : (
            `${clients.length} clients`
          )
        }
        action={
          can(user.role, "clients.manage") ? <LinkButton href="/clients/new">+ New client</LinkButton> : undefined
        }
      />

      <form method="get" className="mb-4">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, phone, suburb…"
          aria-label="Search clients"
          enterKeyHint="search"
        />
      </form>

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon="👥"
            title={q ? "No clients matched" : "No clients yet"}
            body={
              q
                ? "Try just the surname, or the suburb."
                : "Add the first one and you can start quoting straight away."
            }
            action={
              q ? (
                <LinkButton href="/clients" variant="secondary">Clear search</LinkButton>
              ) : can(user.role, "clients.manage") ? (
                <LinkButton href="/clients/new">+ New client</LinkButton>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {clients.map((client) => (
            <li key={client.id} className="card">
              <Link href={`/clients/${client.id}`} className="block p-4 hover:bg-ink-50 active:bg-ink-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold text-ink-900">
                      {client.name}
                      {client.type === "company" ? (
                        <span className="ml-2 text-xs font-semibold uppercase text-ink-500">Company</span>
                      ) : null}
                    </h2>
                    <p className="truncate text-sm text-ink-600">
                      {[client.suburb, client.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                  </div>
                  {client.onHold ? <Badge tone="bad">On hold</Badge> : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-ink-600">
                    {client.jobCount} job{client.jobCount === 1 ? "" : "s"}
                    {client.liveJobCount > 0 ? ` · ${client.liveJobCount} live` : ""}
                  </span>
                  {client.outstandingCents > 0 ? (
                    <span className="font-bold text-bad-700">
                      {formatMoney(client.outstandingCents)} owing
                      {client.oldestDueDate ? ` · ${relativeDueLabel(client.oldestDueDate).toLowerCase()}` : ""}
                    </span>
                  ) : client.lifetimeInvoicedCents > 0 ? (
                    <span className="font-semibold text-good-700">All paid up</span>
                  ) : null}
                  {client.lastActivityAt ? (
                    <span className="text-ink-500">Last touched {timeAgo(client.lastActivityAt)}</span>
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
