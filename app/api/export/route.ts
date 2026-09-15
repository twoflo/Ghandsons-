import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { toCsv, csvMoney, csvResponse } from "@/modules/reports/csv";
import { audit } from "@/lib/audit";
import { financialYear, isoDate } from "@/lib/dates";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

async function rows(query: Parameters<typeof db.execute>[0]): Promise<Row[]> {
  return (await db.execute(query)) as unknown as Row[];
}

/**
 * CSV export of everything, for the accountant.
 *
 * One endpoint, `?dataset=` picks what. Dates are ISO so they sort; money is
 * a plain decimal so it sums; GST is broken out on every financial row
 * because that is the first thing a bookkeeper asks for.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!can(user.role, "reports.export")) return new Response("No access", { status: 403 });

  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset") ?? "invoices";
  const fy = financialYear();
  const from = url.searchParams.get("from") ?? fy.start;
  const to = url.searchParams.get("to") ?? isoDate(new Date());

  await audit({
    entityType: "report",
    entityId: "00000000-0000-0000-0000-000000000000",
    action: "send",
    summary: `Exported ${dataset} as CSV for ${from} to ${to}`,
    actorUserId: user.id,
    actorLabel: user.fullName,
  });

  switch (dataset) {
    case "invoices": {
      const data = await rows(sql`
        SELECT i.invoice_number, i.issue_date, i.due_date, c.name AS client,
               j.job_number, i.type::text, i.status::text,
               i.subtotal_cents, i.tax_cents, i.total_cents,
               i.amount_paid_cents, i.balance_cents, i.reference
        FROM invoices i
        JOIN clients c ON c.id = i.client_id
        LEFT JOIN jobs j ON j.id = i.job_id
        WHERE i.deleted_at IS NULL AND i.issue_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY i.issue_date, i.invoice_number
      `);
      return csvResponse(
        `invoices-${from}-to-${to}.csv`,
        toCsv(
          ["Invoice", "Issued", "Due", "Client", "Job", "Type", "Status",
           "Ex GST", "GST", "Total", "Paid", "Outstanding", "Reference"],
          data.map((r) => [
            r.invoice_number as string, r.issue_date as string, r.due_date as string,
            r.client as string, (r.job_number as string) ?? "", r.type as string, r.status as string,
            csvMoney(r.subtotal_cents as number), csvMoney(r.tax_cents as number),
            csvMoney(r.total_cents as number), csvMoney(r.amount_paid_cents as number),
            csvMoney(r.balance_cents as number), (r.reference as string) ?? "",
          ]),
        ),
      );
    }

    case "expenses": {
      const data = await rows(sql`
        SELECT e.expense_date, e.description, s.name AS supplier, ec.name AS category,
               ec.kind::text AS category_kind, j.job_number, e.subtotal_cents, e.tax_cents,
               e.total_cents, e.is_billable, e.payment_method::text, e.reference,
               (e.receipt_file_id IS NOT NULL) AS has_receipt
        FROM expenses e
        LEFT JOIN suppliers s ON s.id = e.supplier_id
        LEFT JOIN expense_categories ec ON ec.id = e.category_id
        LEFT JOIN jobs j ON j.id = e.job_id
        WHERE e.deleted_at IS NULL AND e.expense_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY e.expense_date, e.created_at
      `);
      return csvResponse(
        `expenses-${from}-to-${to}.csv`,
        toCsv(
          ["Date", "Description", "Supplier", "Category", "Type", "Job",
           "Ex GST", "GST", "Total", "Billable", "Paid with", "Reference", "Receipt attached"],
          data.map((r) => [
            r.expense_date as string, r.description as string, (r.supplier as string) ?? "",
            (r.category as string) ?? "", (r.category_kind as string) ?? "",
            (r.job_number as string) ?? "", csvMoney(r.subtotal_cents as number),
            csvMoney(r.tax_cents as number), csvMoney(r.total_cents as number),
            r.is_billable ? "Yes" : "No", r.payment_method as string,
            (r.reference as string) ?? "", r.has_receipt ? "Yes" : "No",
          ]),
        ),
      );
    }

    case "payments": {
      const data = await rows(sql`
        SELECT p.paid_on, i.invoice_number, c.name AS client, p.amount_cents,
               p.method::text, p.reference
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN clients c ON c.id = i.client_id
        WHERE p.deleted_at IS NULL AND p.paid_on BETWEEN ${from}::date AND ${to}::date
        ORDER BY p.paid_on
      `);
      return csvResponse(
        `payments-${from}-to-${to}.csv`,
        toCsv(
          ["Date", "Invoice", "Client", "Amount", "Method", "Reference"],
          data.map((r) => [
            r.paid_on as string, r.invoice_number as string, r.client as string,
            csvMoney(r.amount_cents as number), r.method as string, (r.reference as string) ?? "",
          ]),
        ),
      );
    }

    case "jobs": {
      const data = await rows(sql`
        SELECT f.job_number, f.title, c.name AS client, f.status::text,
               j.start_date, j.actual_end_date,
               f.contract_value_cents, f.approved_variations_cents, f.revised_contract_cents,
               f.revised_budget_cents, f.actual_labour_cents, f.actual_material_cents,
               f.actual_subcontractor_cents, f.actual_plant_cents, f.actual_other_cents,
               f.actual_total_cents, f.invoiced_ex_tax_cents, f.outstanding_cents,
               (f.revised_contract_cents - f.actual_total_cents) AS profit_cents
        FROM job_financials f
        JOIN jobs j ON j.id = f.job_id
        JOIN clients c ON c.id = f.client_id
        ORDER BY f.job_number
      `);
      return csvResponse(
        `jobs-${to}.csv`,
        toCsv(
          ["Job", "Title", "Client", "Status", "Start", "Finished",
           "Contract", "Variations", "Revised contract", "Budget",
           "Labour", "Materials", "Subcontractors", "Plant", "Other", "Total cost",
           "Invoiced", "Outstanding", "Profit"],
          data.map((r) => [
            r.job_number as string, r.title as string, r.client as string, r.status as string,
            (r.start_date as string) ?? "", (r.actual_end_date as string) ?? "",
            csvMoney(r.contract_value_cents as number), csvMoney(r.approved_variations_cents as number),
            csvMoney(r.revised_contract_cents as number), csvMoney(r.revised_budget_cents as number),
            csvMoney(r.actual_labour_cents as number), csvMoney(r.actual_material_cents as number),
            csvMoney(r.actual_subcontractor_cents as number), csvMoney(r.actual_plant_cents as number),
            csvMoney(r.actual_other_cents as number), csvMoney(r.actual_total_cents as number),
            csvMoney(r.invoiced_ex_tax_cents as number), csvMoney(r.outstanding_cents as number),
            csvMoney(r.profit_cents as number),
          ]),
        ),
      );
    }

    case "timesheets": {
      const data = await rows(sql`
        SELECT te.work_date, u.full_name, j.job_number, j.title, te.description,
               te.minutes, te.break_minutes, te.status::text, te.source::text,
               te.cost_rate_cents, te.cost_cents, te.charge_cents
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN jobs j ON j.id = te.job_id
        WHERE te.deleted_at IS NULL AND te.work_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY te.work_date, u.full_name
      `);
      return csvResponse(
        `timesheets-${from}-to-${to}.csv`,
        toCsv(
          ["Date", "Who", "Job", "Job title", "What", "Hours", "Break (mins)",
           "Status", "Source", "Cost rate/hr", "Cost", "Charge"],
          data.map((r) => [
            r.work_date as string, r.full_name as string, (r.job_number as string) ?? "",
            (r.title as string) ?? "", (r.description as string) ?? "",
            ((r.minutes as number) / 60).toFixed(2), r.break_minutes as number,
            r.status as string, r.source as string,
            csvMoney(r.cost_rate_cents as number), csvMoney(r.cost_cents as number),
            csvMoney(r.charge_cents as number),
          ]),
        ),
      );
    }

    case "clients": {
      const data = await rows(sql`
        SELECT c.name, c.type::text, c.abn, c.email, c.phone,
               CONCAT_WS(' ', c.address_line1, c.suburb, c.state, c.postcode) AS address,
               COALESCE(b.lifetime_invoiced_cents, 0) AS invoiced,
               COALESCE(b.lifetime_paid_cents, 0) AS paid,
               COALESCE(b.outstanding_cents, 0) AS outstanding
        FROM clients c
        LEFT JOIN client_balances b ON b.client_id = c.id
        WHERE c.deleted_at IS NULL
        ORDER BY c.name
      `);
      return csvResponse(
        `clients-${to}.csv`,
        toCsv(
          ["Name", "Type", "ABN", "Email", "Phone", "Address", "Invoiced", "Paid", "Outstanding"],
          data.map((r) => [
            r.name as string, r.type as string, (r.abn as string) ?? "", (r.email as string) ?? "",
            (r.phone as string) ?? "", (r.address as string) ?? "",
            csvMoney(r.invoiced as number), csvMoney(r.paid as number),
            csvMoney(r.outstanding as number),
          ]),
        ),
      );
    }

    case "gst": {
      const data = await rows(sql`
        SELECT 'Sale' AS direction, i.issue_date AS date, i.invoice_number AS reference,
               c.name AS party, i.subtotal_cents AS ex_gst, i.tax_cents AS gst, i.total_cents AS total
        FROM invoices i JOIN clients c ON c.id = i.client_id
        WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft','void')
          AND i.issue_date BETWEEN ${from}::date AND ${to}::date
        UNION ALL
        SELECT 'Purchase', e.expense_date, COALESCE(e.reference, e.description),
               COALESCE(s.name, e.supplier_name_raw, 'Unknown'),
               e.subtotal_cents, e.tax_cents, e.total_cents
        FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id
        WHERE e.deleted_at IS NULL AND e.expense_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY date
      `);
      return csvResponse(
        `gst-${from}-to-${to}.csv`,
        toCsv(
          ["Direction", "Date", "Reference", "Party", "Ex GST", "GST", "Total"],
          data.map((r) => [
            r.direction as string, r.date as string, r.reference as string, r.party as string,
            csvMoney(r.ex_gst as number), csvMoney(r.gst as number), csvMoney(r.total as number),
          ]),
        ),
      );
    }

    case "audit": {
      if (!can(user.role, "audit.view")) return new Response("No access", { status: 403 });
      const data = await rows(sql`
        SELECT a.created_at, a.entity_type, a.action::text, a.summary,
               COALESCE(u.full_name, a.actor_label, 'System') AS actor, a.amount_cents
        FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.created_at BETWEEN ${from}::date AND (${to}::date + 1)
        ORDER BY a.created_at DESC
      `);
      return csvResponse(
        `audit-${from}-to-${to}.csv`,
        toCsv(
          ["When", "What", "Action", "Description", "Who", "Amount"],
          data.map((r) => [
            (r.created_at as Date)?.toISOString?.() ?? String(r.created_at),
            r.entity_type as string, r.action as string, r.summary as string,
            r.actor as string,
            r.amount_cents === null ? "" : csvMoney(r.amount_cents as number),
          ]),
        ),
      );
    }

    default:
      return new Response(`Don't know how to export "${dataset}".`, { status: 400 });
  }
}
