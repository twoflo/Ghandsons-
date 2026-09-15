import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getClient, getClientContacts, getClientSites, getClientInteractions, getClientInvoices,
} from "@/modules/clients/queries";
import { listJobs } from "@/modules/jobs/queries";
import { formatMoney } from "@/lib/money";
import { formatDate, relativeDueLabel, timeAgo } from "@/lib/dates";
import { INVOICE_STATUS, type InvoiceStatus } from "@/lib/status";
import {
  Card, CardHeader, DataList, Badge, EmptyState, LinkButton, StatTile, Alert, PageHeader,
} from "@/components/ui";
import { JobCard } from "@/components/job-card";
import { InteractionForm } from "@/modules/clients/interaction-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const client = await getClient((await params).id);
  return { title: client?.name ?? "Client" };
}

const KIND_ICON: Record<string, string> = {
  call: "📞", email: "✉️", sms: "💬", meeting: "🤝", site_visit: "🚗", note: "📝",
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [client, contacts, sites, interactions, invoices, jobs] = await Promise.all([
    getClient(id),
    getClientContacts(id),
    getClientSites(id),
    getClientInteractions(id),
    getClientInvoices(id),
    listJobs({ clientId: id }),
  ]);

  if (!client) notFound();

  const address = [client.addressLine1, client.addressLine2, client.suburb, client.state, client.postcode]
    .filter(Boolean).join(" ");
  const openInvoices = invoices.filter((i) => i.balanceCents > 0 && i.status !== "void" && i.status !== "draft");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={client.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {client.type === "company" ? <Badge>Company</Badge> : null}
            {client.abn ? <span>ABN {client.abn}</span> : null}
            {client.source ? <span className="text-ink-500">via {client.source}</span> : null}
          </span>
        }
        back={{ href: "/clients", label: "All clients" }}
        action={
          can(user.role, "clients.manage") ? (
            <div className="flex gap-2">
              <LinkButton href={`/jobs/new?clientId=${client.id}`} variant="secondary">+ Job</LinkButton>
              <LinkButton href={`/clients/${client.id}/edit`}>Edit</LinkButton>
            </div>
          ) : undefined
        }
      />

      {client.onHold ? (
        <div className="mb-4">
          <Alert tone="bad" title="This client is on hold">
            Don&apos;t start new work until the account is squared away.
          </Alert>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Owing now"
          value={formatMoney(client.outstandingCents)}
          sub={
            client.oldestDueDate
              ? relativeDueLabel(client.oldestDueDate)
              : `${client.openInvoiceCount} open invoices`
          }
          tone={client.outstandingCents > 0 ? "bad" : "good"}
        />
        <StatTile label="Invoiced all up" value={formatMoney(client.lifetimeInvoicedCents)} />
        <StatTile label="Paid all up" value={formatMoney(client.lifetimePaidCents)} tone="good" />
        <StatTile
          label="Jobs"
          value={jobs.length}
          sub={`${jobs.filter((j) => ["won", "scheduled", "in_progress"].includes(j.status)).length} live`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section>
            <h2 className="mb-2 text-lg font-bold text-ink-800">Jobs</h2>
            {jobs.length === 0 ? (
              <Card>
                <EmptyState
                  icon="🔨"
                  title="No jobs yet"
                  body="Once you quote something for this client it'll show here."
                  action={
                    can(user.role, "jobs.manage") ? (
                      <LinkButton href={`/jobs/new?clientId=${client.id}`}>+ New job</LinkButton>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} showMoney={can(user.role, "jobs.viewCosts")} />
                ))}
              </ul>
            )}
          </section>

          {can(user.role, "invoices.view") ? (
            <Card>
              <CardHeader
                title="Invoices"
                subtitle={openInvoices.length ? `${openInvoices.length} still open` : "All settled"}
              />
              {invoices.length === 0 ? (
                <p className="px-4 py-5 text-ink-600">Nothing invoiced yet.</p>
              ) : (
                <ul className="divide-y divide-ink-200">
                  {invoices.map((invoice) => {
                    const status = INVOICE_STATUS[invoice.status as InvoiceStatus];
                    const overdue = invoice.daysOverdue > 0 && invoice.balanceCents > 0;
                    return (
                      <li key={invoice.id}>
                        <Link href={`/invoices/${invoice.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink-900">
                              {invoice.invoiceNumber}
                              {invoice.jobNumber ? <span className="ml-2 text-sm font-normal text-ink-500">{invoice.jobNumber}</span> : null}
                            </p>
                            <p className="text-sm text-ink-600">
                              {invoice.issueDate ? formatDate(invoice.issueDate) : "Not issued"}
                              {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tabular font-bold text-ink-900">{formatMoney(invoice.totalCents)}</p>
                            <Badge tone={overdue ? "bad" : status.tone}>
                              {overdue ? `${invoice.daysOverdue}d overdue` : status.label}
                            </Badge>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Contact history" subtitle="Calls, emails and site visits" />
            <div className="border-b border-ink-200 p-4">
              <InteractionForm clientId={client.id} />
            </div>
            {interactions.length === 0 ? (
              <p className="px-4 py-5 text-ink-600">Nothing logged yet.</p>
            ) : (
              <ol className="divide-y divide-ink-200">
                {interactions.map((item) => (
                  <li key={item.id} className="flex gap-3 px-4 py-3">
                    <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">{KIND_ICON[item.kind] ?? "•"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{item.summary}</p>
                      {item.detail ? <p className="mt-0.5 text-sm text-ink-600">{item.detail}</p> : null}
                      <p className="mt-0.5 text-xs text-ink-500">
                        {timeAgo(item.occurredAt)}
                        {item.userName ? ` · ${item.userName}` : ""}
                        {item.jobNumber ? (
                          <>
                            {" · "}
                            <Link href={`/jobs/${item.jobId}`} className="underline">{item.jobNumber}</Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <div className="px-4 py-2">
              <DataList
                rows={[
                  {
                    label: "Phone",
                    value: client.phone ? (
                      <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="font-semibold underline">{client.phone}</a>
                    ) : "—",
                  },
                  {
                    label: "Email",
                    value: client.email ? (
                      <a href={`mailto:${client.email}`} className="break-all font-semibold underline">{client.email}</a>
                    ) : "—",
                  },
                  { label: "Billing address", value: address || "—" },
                  { label: "Terms", value: client.paymentTermsDays ? `${client.paymentTermsDays} days` : "Business default" },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="People"
              action={
                can(user.role, "clients.manage") ? (
                  <LinkButton href={`/clients/${client.id}/edit#contacts`} size="sm" variant="secondary">Manage</LinkButton>
                ) : undefined
              }
            />
            {contacts.length === 0 ? (
              <p className="px-4 py-4 text-ink-600">No named contacts.</p>
            ) : (
              <ul className="divide-y divide-ink-200">
                {contacts.map((contact) => (
                  <li key={contact.id} className="px-4 py-3">
                    <p className="font-semibold text-ink-900">
                      {contact.name}
                      {contact.isPrimary ? <Badge tone="brand" className="ml-2">Main</Badge> : null}
                    </p>
                    {contact.role ? <p className="text-sm text-ink-600">{contact.role}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      {contact.phone ? (
                        <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="font-semibold text-info-700 underline">
                          {contact.phone}
                        </a>
                      ) : null}
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="break-all font-semibold text-info-700 underline">
                          {contact.email}
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Sites"
              action={
                can(user.role, "clients.manage") ? (
                  <LinkButton href={`/clients/${client.id}/edit#sites`} size="sm" variant="secondary">Manage</LinkButton>
                ) : undefined
              }
            />
            {sites.length === 0 ? (
              <p className="px-4 py-4 text-ink-600">No sites saved.</p>
            ) : (
              <ul className="divide-y divide-ink-200">
                {sites.map((site) => (
                  <li key={site.id} className="px-4 py-3">
                    <p className="font-semibold text-ink-900">{site.label}</p>
                    <p className="text-sm text-ink-600">
                      {[site.addressLine1, site.suburb, site.state, site.postcode].filter(Boolean).join(" ")}
                    </p>
                    {site.hazardNotes ? (
                      <p className="mt-1 rounded bg-bad-50 px-2 py-1 text-sm text-bad-700">⚠️ {site.hazardNotes}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-500">{site.jobCount} job{site.jobCount === 1 ? "" : "s"} here</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {client.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-line px-4 py-3 text-ink-800">{client.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
