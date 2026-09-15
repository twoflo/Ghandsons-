import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type ClientListItem = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  suburb: string | null;
  onHold: boolean;
  jobCount: number;
  liveJobCount: number;
  outstandingCents: number;
  oldestDueDate: string | null;
  lifetimeInvoicedCents: number;
  lastActivityAt: string | null;
};

export async function listClients(search?: string): Promise<ClientListItem[]> {
  const q = search?.trim();
  return rows<ClientListItem>(sql`
    SELECT
      c.id, c.name, c.type::text AS type, c.phone, c.email, c.suburb,
      c.on_hold AS "onHold",
      COALESCE((SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.deleted_at IS NULL), 0)::int AS "jobCount",
      COALESCE((SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.deleted_at IS NULL
                 AND j.status IN ('won','scheduled','in_progress','complete')), 0)::int AS "liveJobCount",
      COALESCE(b.outstanding_cents, 0)::int AS "outstandingCents",
      b.oldest_due_date::text AS "oldestDueDate",
      COALESCE(b.lifetime_invoiced_cents, 0)::int AS "lifetimeInvoicedCents",
      GREATEST(
        (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.client_id = c.id AND i.deleted_at IS NULL),
        (SELECT MAX(j.updated_at) FROM jobs j WHERE j.client_id = c.id AND j.deleted_at IS NULL)
      )::text AS "lastActivityAt"
    FROM clients c
    LEFT JOIN client_balances b ON b.client_id = c.id
    WHERE c.deleted_at IS NULL
      ${q ? sql`AND (c.name ILIKE ${"%" + q + "%"} OR c.email ILIKE ${"%" + q + "%"}
                     OR c.phone ILIKE ${"%" + q + "%"} OR c.suburb ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY b.outstanding_cents DESC NULLS LAST, c.name
  `);
}

export type ClientDetail = {
  id: string;
  name: string;
  type: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  paymentTermsDays: number | null;
  onHold: boolean;
  notes: string | null;
  source: string | null;
  outstandingCents: number;
  lifetimeInvoicedCents: number;
  lifetimePaidCents: number;
  openInvoiceCount: number;
  oldestDueDate: string | null;
};

export async function getClient(id: string): Promise<ClientDetail | null> {
  const [row] = await rows<ClientDetail>(sql`
    SELECT
      c.id, c.name, c.type::text AS type, c.abn, c.email, c.phone,
      c.address_line1 AS "addressLine1", c.address_line2 AS "addressLine2",
      c.suburb, c.state, c.postcode,
      c.payment_terms_days AS "paymentTermsDays", c.on_hold AS "onHold",
      c.notes, c.source,
      COALESCE(b.outstanding_cents, 0)::int AS "outstandingCents",
      COALESCE(b.lifetime_invoiced_cents, 0)::int AS "lifetimeInvoicedCents",
      COALESCE(b.lifetime_paid_cents, 0)::int AS "lifetimePaidCents",
      COALESCE(b.open_invoice_count, 0)::int AS "openInvoiceCount",
      b.oldest_due_date::text AS "oldestDueDate"
    FROM clients c
    LEFT JOIN client_balances b ON b.client_id = c.id
    WHERE c.id = ${id} AND c.deleted_at IS NULL
  `);
  return row ?? null;
}

export type ClientContact = {
  id: string; name: string; role: string | null; email: string | null;
  phone: string | null; isPrimary: boolean;
};

export async function getClientContacts(clientId: string): Promise<ClientContact[]> {
  return rows<ClientContact>(sql`
    SELECT id, name, role, email, phone, is_primary AS "isPrimary"
    FROM contacts WHERE client_id = ${clientId} AND deleted_at IS NULL
    ORDER BY is_primary DESC, name
  `);
}

export type ClientSite = {
  id: string; label: string; addressLine1: string | null; suburb: string | null;
  state: string | null; postcode: string | null; accessNotes: string | null;
  hazardNotes: string | null; jobCount: number;
};

export async function getClientSites(clientId: string): Promise<ClientSite[]> {
  return rows<ClientSite>(sql`
    SELECT s.id, s.label, s.address_line1 AS "addressLine1", s.suburb, s.state, s.postcode,
           s.access_notes AS "accessNotes", s.hazard_notes AS "hazardNotes",
           COALESCE((SELECT COUNT(*) FROM jobs j WHERE j.site_id = s.id AND j.deleted_at IS NULL), 0)::int AS "jobCount"
    FROM sites s WHERE s.client_id = ${clientId} AND s.deleted_at IS NULL
    ORDER BY s.label
  `);
}

export type ClientInteraction = {
  id: string; kind: string; occurredAt: string; summary: string;
  detail: string | null; userName: string | null; jobNumber: string | null; jobId: string | null;
};

export async function getClientInteractions(clientId: string, limit = 30): Promise<ClientInteraction[]> {
  return rows<ClientInteraction>(sql`
    SELECT i.id, i.kind::text AS kind, i.occurred_at::text AS "occurredAt",
           i.summary, i.detail, u.full_name AS "userName",
           j.job_number AS "jobNumber", j.id AS "jobId"
    FROM interactions i
    LEFT JOIN users u ON u.id = i.user_id
    LEFT JOIN jobs j ON j.id = i.job_id
    WHERE i.client_id = ${clientId} AND i.deleted_at IS NULL
    ORDER BY i.occurred_at DESC
    LIMIT ${limit}
  `);
}

export type ClientInvoiceRow = {
  id: string; invoiceNumber: string; status: string; issueDate: string | null;
  dueDate: string | null; totalCents: number; balanceCents: number;
  jobNumber: string | null; daysOverdue: number;
};

export async function getClientInvoices(clientId: string): Promise<ClientInvoiceRow[]> {
  return rows<ClientInvoiceRow>(sql`
    SELECT i.id, i.invoice_number AS "invoiceNumber", i.status::text AS status,
           i.issue_date::text AS "issueDate", i.due_date::text AS "dueDate",
           i.total_cents AS "totalCents", i.balance_cents AS "balanceCents",
           j.job_number AS "jobNumber",
           GREATEST(0, CURRENT_DATE - i.due_date)::int AS "daysOverdue"
    FROM invoices i LEFT JOIN jobs j ON j.id = i.job_id
    WHERE i.client_id = ${clientId} AND i.deleted_at IS NULL
    ORDER BY i.issue_date DESC NULLS LAST, i.invoice_number DESC
  `);
}
